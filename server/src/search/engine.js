// Phase 2 search engine: builds an inverted index in Postgres and ranks documents with BM25 or TF-IDF.
//
// Index:  search_postings(term, doc_id, tf) is the inverted index, search_doc_stats(doc_id, length) the document
//         lengths. Database triggers set search_index_state.dirty whenever indexed text changes; the next search
//         rebuilds the whole index first (about 100 documents, a few milliseconds).
// Query:  the query is tokenised exactly like the documents. Each term gets an IDF weight computed from its
//         document frequency; the score is summed per document in one SQL statement over the postings.
import { pool, query } from '../db.js';
import { tokenize } from './tokenize.js';

// BM25 parameters (the usual defaults).
export const K1 = 1.2;
export const B = 0.75;

// Field weights: a word in the title counts as if it appeared 3 times, a tag or the brand twice.
export const FIELD_WEIGHTS = { title: 3, brand: 2, tags: 2, category: 1, summary: 1, content: 1 };

// A query word with no exact match in the vocabulary is expanded to up to this many terms it is a prefix of
// ("galax" -> "galaxy"), so partial words still find something, as the Phase 1 substring search did.
const PREFIX_EXPANSIONS = 5;

export const RANKERS = ['bm25', 'tfidf', 'baseline'];

// Term frequencies for one document, with the field weights applied.
export function documentTerms(doc) {
  const tf = new Map();
  const add = (text, weight) => {
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + weight);
  };
  add(doc.title, FIELD_WEIGHTS.title);
  add(doc.title_vi, FIELD_WEIGHTS.title);
  add(doc.brand, FIELD_WEIGHTS.brand);
  for (const tag of doc.tags || []) add(tag, FIELD_WEIGHTS.tags);
  add(doc.category, FIELD_WEIGHTS.category);
  add(doc.category_vi, FIELD_WEIGHTS.category);
  add(doc.summary, FIELD_WEIGHTS.summary);
  add(doc.summary_vi, FIELD_WEIGHTS.summary);
  add(doc.content, FIELD_WEIGHTS.content);
  add(doc.content_vi, FIELD_WEIGHTS.content);
  return tf;
}

const DOCS_SQL = `
  SELECT d.id, d.title, d.title_vi, d.summary, d.summary_vi, d.content, d.content_vi, d.brand,
         c.name AS category, c.name_vi AS category_vi,
         coalesce(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS tags
    FROM documents d
    LEFT JOIN categories c ON c.id = d.category_id
    LEFT JOIN document_tags dt ON dt.document_id = d.id
    LEFT JOIN tags t ON t.id = dt.tag_id
   WHERE d.status = 'published'
   GROUP BY d.id, c.id`;

// Rebuilds the index if it is marked dirty (or always, with force). Safe to call concurrently: the state row is
// locked for the whole rebuild, and a second caller finds it clean once the first commits.
export async function ensureIndex({ force = false } = {}) {
  if (!force) {
    const { rows } = await query('SELECT dirty FROM search_index_state WHERE id = 1');
    if (rows[0] && !rows[0].dirty) return false;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = (await client.query('SELECT dirty FROM search_index_state WHERE id = 1 FOR UPDATE')).rows[0];
    if (!state) {
      await client.query('INSERT INTO search_index_state (id, dirty) VALUES (1, true)');
    } else if (!state.dirty && !force) {
      await client.query('COMMIT');
      return false;
    }
    const docs = (await client.query(DOCS_SQL)).rows;
    const terms = [];
    const docIds = [];
    const tfs = [];
    const lengths = [];
    for (const doc of docs) {
      const tf = documentTerms(doc);
      let len = 0;
      for (const [term, n] of tf) {
        terms.push(term);
        docIds.push(doc.id);
        tfs.push(n);
        len += n;
      }
      lengths.push(len);
    }
    await client.query('DELETE FROM search_postings');
    await client.query('DELETE FROM search_doc_stats');
    await client.query(
      'INSERT INTO search_postings (term, doc_id, tf) SELECT * FROM unnest($1::text[], $2::int[], $3::int[])',
      [terms, docIds, tfs],
    );
    await client.query(
      'INSERT INTO search_doc_stats (doc_id, length) SELECT * FROM unnest($1::int[], $2::int[])',
      [docs.map((d) => d.id), lengths],
    );
    await client.query(
      `UPDATE search_index_state SET dirty = false, built_at = now(), doc_count = $1,
         term_count = (SELECT count(DISTINCT term) FROM search_postings) WHERE id = 1`,
      [docs.length],
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// IDF variants. BM25 uses the Robertson-Sparck Jones form with +1 so it never goes negative.
export const idf = {
  bm25: (N, df) => Math.log(1 + (N - df + 0.5) / (df + 0.5)),
  tfidf: (N, df) => Math.log(1 + N / df),
};

// Turns a query into weighted index terms: [{ term, weight, from }]. Repeated query words add up.
// Words missing from the vocabulary are expanded by prefix. Returns [] when nothing in the index matches.
export async function queryTerms(text, ranker = 'bm25') {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const qtf = new Map();
  for (const t of tokens) qtf.set(t, (qtf.get(t) || 0) + 1);
  const words = [...qtf.keys()];

  const stats = (await query('SELECT count(*)::int AS n FROM search_doc_stats')).rows[0];
  const N = stats.n;
  if (!N) return [];
  const dfRows = (await query(
    'SELECT term, count(*)::int AS df FROM search_postings WHERE term = ANY($1::text[]) GROUP BY term', [words],
  )).rows;
  const df = new Map(dfRows.map((r) => [r.term, r.df]));

  const out = new Map();
  const add = (term, d, from, mult) => {
    const w = idf[ranker](N, d) * mult;
    const prev = out.get(term);
    if (!prev || prev.weight < w) out.set(term, { term, weight: w, df: d, from });
  };
  for (const word of words) {
    if (df.has(word)) {
      add(word, df.get(word), word, qtf.get(word));
      continue;
    }
    const like = word.replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
    const { rows } = await query(
      `SELECT term, count(*)::int AS df FROM search_postings WHERE term LIKE $1 ESCAPE '\\'
        GROUP BY term ORDER BY count(*) DESC, term LIMIT ${PREFIX_EXPANSIONS}`,
      [like],
    );
    for (const r of rows) add(r.term, r.df, word, qtf.get(word));
  }
  return [...out.values()];
}

// SQL scoring expression per ranker, over postings p (tf) and doc stats s (length).
// BM25:   idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len / avgdl))
// TF-IDF: idf * (1 + ln tf) / sqrt(len)   (log-scaled term frequency, length-normalised)
function scoreSql(ranker, avgdlParam) {
  if (ranker === 'tfidf') return 'q.w * (1 + ln(p.tf)) / sqrt(greatest(s.length, 1))';
  return `q.w * p.tf * ${K1 + 1} / (p.tf + ${K1} * (1 - ${B} + ${B} * s.length / ${avgdlParam}))`;
}

// Builds the SQL pieces that restrict and rank documents d for a text query. p(value) pushes a bind parameter
// and returns its placeholder. Returns { cte, join, where, order, score }:
//   cte    WITH clause to put before SELECT ('' if none)
//   join   JOIN to append after "FROM documents d"
//   where  extra WHERE conditions
//   order  ORDER BY for relevance, or null when the ranker has no score (baseline)
//   score  SQL expression for the score column
// Rankers: bm25 and tfidf use the inverted index. baseline is the Phase 1 behaviour (accent-insensitive
// substring match, newest first) and is kept for comparison and for queries with no word characters ("%").
export async function searchClause(text, ranker, p) {
  if (!RANKERS.includes(ranker)) throw new Error(`unknown ranker ${ranker}`);
  if (ranker === 'baseline' || tokenize(text).length === 0) {
    const like = p(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    return {
      cte: '',
      join: '',
      where: [`(d.document_search LIKE f_unaccent(lower(${like})) ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                    WHERE dt.document_id = d.id AND f_unaccent(lower(t.name)) LIKE f_unaccent(lower(${like})) ESCAPE '\\'))`],
      order: null,
      score: 'NULL::float8',
    };
  }
  await ensureIndex();
  const terms = await queryTerms(text, ranker);
  if (!terms.length) return { cte: '', join: '', where: ['false'], order: null, score: 'NULL::float8' };
  const t = p(terms.map((x) => x.term));
  const w = p(terms.map((x) => x.weight));
  let a = null;
  if (ranker === 'bm25') {
    const avgdl = (await query('SELECT coalesce(avg(length), 1)::float8 AS a FROM search_doc_stats')).rows[0].a;
    a = p(avgdl);
  }
  return {
    cte: `WITH q(term, w) AS (SELECT * FROM unnest(${t}::text[], ${w}::float8[])),
      scores AS (
        SELECT p.doc_id, sum(${scoreSql(ranker, `${a}::float8`)}) AS score
          FROM search_postings p
          JOIN q ON q.term = p.term
          JOIN search_doc_stats s ON s.doc_id = p.doc_id
         GROUP BY p.doc_id
      ) `,
    join: 'JOIN scores sc ON sc.doc_id = d.id',
    where: [],
    order: 'sc.score DESC, d.id DESC',
    score: 'sc.score',
  };
}

// Ranked document ids for a query, best first. Used by the evaluation, which mirrors the storefront search
// (published documents, products only by default).
export async function rankIds(text, ranker = 'bm25', { limit = 10, kind = 'product' } = {}) {
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const m = await searchClause(text, ranker, p);
  const where = ["d.status = 'published'", ...m.where];
  if (kind) where.push(`d.kind = ${p(kind)}`);
  const order = m.order ?? 'd.created_at DESC, d.id DESC';
  const { rows } = await query(
    `${m.cte}SELECT d.id FROM documents d ${m.join} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${p(limit)}`,
    params,
  );
  return rows.map((r) => r.id);
}

export async function indexInfo() {
  await ensureIndex();
  const { rows } = await query(
    `SELECT s.built_at, s.doc_count, s.term_count,
            (SELECT count(*)::int FROM search_postings) AS postings,
            (SELECT coalesce(round(avg(length), 1), 0)::float FROM search_doc_stats) AS avgdl
       FROM search_index_state s WHERE id = 1`,
  );
  return rows[0];
}
