// Search evaluation using the click log.
//
// Offline: clicks become relevance judgments. For each distinct query (normalised with the same tokeniser as the
// index), every document clicked for it is relevant, with a graded gain equal to its click count. Each ranker is
// run on every judged query and scored with P@k, R@k, MRR, MAP@k and nDCG@k (macro-averaged over queries).
//
// Online: behaviour of real users on logged searches: click-through rate, rank of clicked results, the
// reciprocal rank of the first click, zero-result rate, and clicks per rank position.
//
// Caveat worth stating in a report: clicks are biased toward whatever the live ranker showed near the top, so
// judgments from clicks tend to favour the ranker that produced them.
import { query } from '../db.js';
import { tokenize, fold } from './tokenize.js';
import { rankIds, RANKERS } from './engine.js';

export const queryKey = (text) => tokenize(text).join(' ') || fold(text).trim();

// ---- metrics over one ranked list. ranked: doc ids best first; gains: Map(docId -> gain > 0) ----

export function precisionAt(ranked, gains, k) {
  return ranked.slice(0, k).filter((id) => gains.has(id)).length / k;
}

export function recallAt(ranked, gains, k) {
  if (!gains.size) return 0;
  return ranked.slice(0, k).filter((id) => gains.has(id)).length / gains.size;
}

export function reciprocalRank(ranked, gains, k = ranked.length) {
  const i = ranked.slice(0, k).findIndex((id) => gains.has(id));
  return i === -1 ? 0 : 1 / (i + 1);
}

export function averagePrecisionAt(ranked, gains, k) {
  let hits = 0;
  let sum = 0;
  ranked.slice(0, k).forEach((id, i) => {
    if (gains.has(id)) {
      hits += 1;
      sum += hits / (i + 1);
    }
  });
  const denom = Math.min(gains.size, k);
  return denom ? sum / denom : 0;
}

// nDCG with linear gains: DCG = sum gain_i / log2(i + 1), normalised by the DCG of the ideal ordering.
export function ndcgAt(ranked, gains, k) {
  const dcg = ranked.slice(0, k).reduce((s, id, i) => s + (gains.get(id) || 0) / Math.log2(i + 2), 0);
  const ideal = [...gains.values()].sort((a, b) => b - a).slice(0, k)
    .reduce((s, g, i) => s + g / Math.log2(i + 2), 0);
  return ideal ? dcg / ideal : 0;
}

export function scoreRanking(ranked, gains, k) {
  return {
    precision: precisionAt(ranked, gains, k),
    precision5: precisionAt(ranked, gains, 5),
    recall: recallAt(ranked, gains, k),
    mrr: reciprocalRank(ranked, gains, k),
    map: averagePrecisionAt(ranked, gains, k),
    ndcg: ndcgAt(ranked, gains, k),
  };
}

const METRICS = ['precision', 'precision5', 'recall', 'mrr', 'map', 'ndcg'];
const round = (x) => Math.round(x * 10000) / 10000;

// Relevance judgments from clicks on published documents: [{ key, query, searches, gains: Map(docId -> clicks) }].
export async function loadJudgments({ minClicks = 1 } = {}) {
  const { rows } = await query(
    `SELECT l.query_string, l.clicked_doc_id AS doc_id, count(*)::int AS clicks
       FROM search_click_log l JOIN documents d ON d.id = l.clicked_doc_id AND d.status = 'published'
      WHERE l.query_string <> ''
      GROUP BY 1, 2`,
  );
  const byKey = new Map();
  for (const r of rows) {
    const key = queryKey(r.query_string);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { key, labels: new Map(), gains: new Map() });
    const j = byKey.get(key);
    j.labels.set(r.query_string, (j.labels.get(r.query_string) || 0) + r.clicks);
    j.gains.set(r.doc_id, (j.gains.get(r.doc_id) || 0) + r.clicks);
  }
  const out = [];
  for (const j of byKey.values()) {
    for (const [id, g] of j.gains) if (g < minClicks) j.gains.delete(id);
    if (!j.gains.size) continue;
    // Show the most common raw spelling of the query.
    const queryText = [...j.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    out.push({ key: j.key, query: queryText, gains: j.gains });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export async function offlineEvaluation({ k = 10, rankers = RANKERS, minClicks = 1, kind = 'product' } = {}) {
  const judgments = await loadJudgments({ minClicks });
  const perQuery = [];
  const totals = Object.fromEntries(rankers.map((r) => [r, Object.fromEntries(METRICS.map((m) => [m, 0]))]));
  for (const j of judgments) {
    const row = { query: j.query, relevant: j.gains.size, clicks: [...j.gains.values()].reduce((a, b) => a + b, 0), rankers: {} };
    for (const r of rankers) {
      const ranked = await rankIds(j.query, r, { limit: k, kind });
      const s = scoreRanking(ranked, j.gains, k);
      for (const m of METRICS) totals[r][m] += s[m];
      row.rankers[r] = { ...Object.fromEntries(METRICS.map((m) => [m, round(s[m])])), top: ranked.slice(0, 5) };
    }
    perQuery.push(row);
  }
  const n = judgments.length;
  const summary = Object.fromEntries(rankers.map((r) => [
    r, Object.fromEntries(METRICS.map((m) => [m, n ? round(totals[r][m] / n) : 0])),
  ]));
  return { k, queries: n, summary, perQuery };
}

// Online metrics from searches that logged their result list (result_ids), i.e. searches made since Phase 2.
export async function onlineEvaluation() {
  const base = (await query(
    `SELECT count(*)::int AS searches,
            count(*) FILTER (WHERE result_count = 0)::int AS zero_result
       FROM search_click_log WHERE result_count IS NOT NULL`,
  )).rows[0];
  const ranked = (await query(
    `WITH s AS (
       SELECT l.id, (SELECT min(c.clicked_rank) FROM search_click_log c WHERE c.search_id = l.id) AS first_rank,
              (SELECT count(*) FROM search_click_log c WHERE c.search_id = l.id)::int AS clicks
         FROM search_click_log l
        WHERE l.result_ids IS NOT NULL AND l.result_count > 0)
     SELECT count(*)::int AS searches,
            count(*) FILTER (WHERE clicks > 0)::int AS clicked,
            coalesce(sum(clicks), 0)::int AS clicks,
            coalesce(avg(CASE WHEN first_rank IS NULL THEN 0 ELSE 1.0 / first_rank END), 0)::float AS mrr
       FROM s`,
  )).rows[0];
  const rankRow = (await query(
    `SELECT coalesce(avg(clicked_rank), 0)::float AS mean_rank,
            count(*) FILTER (WHERE clicked_rank <= 3)::int AS top3,
            count(*)::int AS n
       FROM search_click_log WHERE clicked_rank IS NOT NULL`,
  )).rows[0];
  const byRank = (await query(
    `SELECT least(clicked_rank, 11) AS rank, count(*)::int AS clicks
       FROM search_click_log WHERE clicked_rank IS NOT NULL GROUP BY 1 ORDER BY 1`,
  )).rows;
  return {
    searches: base.searches,
    zeroResultRate: base.searches ? round(base.zero_result / base.searches) : 0,
    rankedSearches: ranked.searches,
    clickThroughRate: ranked.searches ? round(ranked.clicked / ranked.searches) : 0,
    clicks: ranked.clicks,
    mrr: round(ranked.mrr),
    meanClickedRank: round(rankRow.mean_rank),
    top3Share: rankRow.n ? round(rankRow.top3 / rankRow.n) : 0,
    clicksByRank: byRank.map((r) => ({ rank: r.rank > 10 ? '11+' : String(r.rank), clicks: r.clicks })),
  };
}
