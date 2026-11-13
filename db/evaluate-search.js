// Evaluates the search engine against the click log and prints a report. Read-only (it may build the index).
// Usage from repo root: DATABASE_URL=... node db/evaluate-search.js [--k=10] [--min-clicks=1] [--json] [--queries]
//   --k           cut-off for P@k, R@k, MAP@k, nDCG@k (default 10)
//   --min-clicks  ignore (query, document) pairs clicked fewer times than this (default 1)
//   --queries     also print the per-query table
//   --json        print the raw result as JSON instead
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/src/db.js';
import { indexInfo } from '../server/src/search/engine.js';
import { offlineEvaluation, onlineEvaluation } from '../server/src/search/evaluate.js';

const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : dflt;
};

const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(7);
const f3 = (x) => x.toFixed(3).padStart(7);

export async function report({ k = 10, minClicks = 1 } = {}) {
  const index = await indexInfo();
  const offline = await offlineEvaluation({ k, minClicks });
  const online = await onlineEvaluation();
  return { index, offline, online };
}

function print({ index, offline, online }, withQueries) {
  const { k } = offline;
  console.log('Inverted index');
  console.log(`  documents ${index.doc_count}, terms ${index.term_count}, postings ${index.postings}, avg length ${index.avgdl}`);
  console.log(`\nOffline evaluation: ${offline.queries} queries judged from clicks (gain = click count)`);
  console.log(`  ${'ranker'.padEnd(9)}${'P@5'.padStart(7)}${`P@${k}`.padStart(7)}${`R@${k}`.padStart(7)}${'MRR'.padStart(7)}${`MAP@${k}`.padStart(8)}${`nDCG@${k}`.padStart(9)}`);
  for (const [r, m] of Object.entries(offline.summary)) {
    console.log(`  ${r.padEnd(9)}${f3(m.precision5)}${f3(m.precision)}${f3(m.recall)}${f3(m.mrr)} ${f3(m.map)}  ${f3(m.ndcg)}`);
  }
  if (withQueries) {
    console.log(`\n  ${'query'.padEnd(32)}${'rel'.padStart(4)}  nDCG@${k}: ${Object.keys(offline.summary).join(' / ')}`);
    for (const q of offline.perQuery) {
      const v = Object.values(q.rankers).map((m) => m.ndcg.toFixed(2)).join(' / ');
      console.log(`  ${q.query.slice(0, 31).padEnd(32)}${String(q.relevant).padStart(4)}  ${v}`);
    }
  }
  console.log('\nOnline evaluation (logged user behaviour)');
  console.log(`  searches ${online.searches}, zero-result rate ${pct(online.zeroResultRate).trim()}`);
  console.log(`  searches with a ranked result list ${online.rankedSearches}, click-through rate ${pct(online.clickThroughRate).trim()}`);
  console.log(`  MRR of first click ${online.mrr.toFixed(3)}, mean clicked rank ${online.meanClickedRank.toFixed(2)}, clicks in top 3 ${pct(online.top3Share).trim()}`);
  if (online.clicksByRank.length) {
    console.log(`  clicks by rank: ${online.clicksByRank.map((r) => `${r.rank}:${r.clicks}`).join('  ')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await report({ k: arg('k', 10), minClicks: arg('min-clicks', 1) });
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(result, process.argv.includes('--queries'));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
