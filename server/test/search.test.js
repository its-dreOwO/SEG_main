import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';
import { tokenize, stem } from '../src/search/tokenize.js';
import { ensureIndex, queryTerms, rankIds, documentTerms } from '../src/search/engine.js';
import {
  precisionAt, recallAt, reciprocalRank, averagePrecisionAt, ndcgAt, loadJudgments, offlineEvaluation, onlineEvaluation,
} from '../src/search/evaluate.js';

const D = {};
async function addDoc(key, f) {
  const { rows } = await query(
    `INSERT INTO documents (kind, title, title_vi, slug, content, summary, category_id, brand, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM categories WHERE slug = $7), $8, $9, $10) RETURNING id`,
    [f.kind || 'product', f.title, f.title_vi ?? null, key, f.content || '', f.summary || '', f.category || 'phones',
      f.brand || 'Acme', f.status || 'published', f.created || '2026-01-01'],
  );
  D[key] = rows[0].id;
}

before(async () => {
  await resetDb();
  await addDoc('pixel', { title: 'Google Pixel 8', summary: 'A compact Android phone.', content: '<p>Great camera phone.</p>', brand: 'Google', created: '2026-01-01' });
  await addDoc('galaxy', { title: 'Samsung Galaxy S24', summary: 'Android phone with a bright screen.', brand: 'Samsung', created: '2026-02-01' });
  await addDoc('case', { title: 'Phone case', summary: 'Fits the Pixel 8. A case for your phone, phone, phone.', created: '2026-03-01' });
  await addDoc('buds', { title: 'Wireless earbuds', title_vi: 'Tai nghe không dây', category: 'headphones', created: '2026-04-01' });
  await addDoc('draft', { title: 'Pixel 9 leak', status: 'draft', created: '2026-05-01' });
});
after(() => pool.end());

test('tokenize: lowercase, accents folded, html stripped, stopwords dropped, plurals stemmed', () => {
  assert.deepEqual(tokenize('The <b>Wireless</b> Headphones &amp; Earbuds'), ['wireless', 'headphone', 'earbud']);
  assert.deepEqual(tokenize('Tai nghe KHÔNG dây, đồng hồ'), ['tai', 'nghe', 'khong', 'day', 'dong', 'ho']);
  assert.deepEqual(tokenize('Pixel 8 / WH-1000XM5 16GB'), ['pixel', '8', 'wh', '1000xm5', '16gb']);
  assert.deepEqual(tokenize('%%% -- '), []);
  assert.equal(stem('batteries'), 'battery');
  assert.equal(stem('boxes'), 'box');
  assert.equal(stem('glass'), 'glass');
  assert.equal(stem('ios'), 'ios');
});

test('documentTerms applies field weights (title x3)', () => {
  const tf = documentTerms({ title: 'Pixel phone', summary: 'phone' });
  assert.equal(tf.get('pixel'), 3);
  assert.equal(tf.get('phone'), 4);
});

test('the inverted index holds published documents only, and rebuilds when text changes', async () => {
  await ensureIndex({ force: true });
  const ids = (await query("SELECT doc_id FROM search_postings WHERE term = 'pixel' ORDER BY doc_id")).rows.map((r) => r.doc_id);
  assert.deepEqual(ids, [D.pixel, D.case].sort((a, b) => a - b));
  assert.equal((await query('SELECT dirty FROM search_index_state')).rows[0].dirty, false);

  await query('UPDATE documents SET views_count = views_count + 1 WHERE id = $1', [D.pixel]);
  assert.equal((await query('SELECT dirty FROM search_index_state')).rows[0].dirty, false, 'view counts do not dirty the index');

  await query("UPDATE documents SET title = 'Google Pixel 8 Pro' WHERE id = $1", [D.pixel]);
  assert.equal((await query('SELECT dirty FROM search_index_state')).rows[0].dirty, true);
  assert.deepEqual(await rankIds('pro', 'bm25'), [D.pixel], 'search rebuilds a dirty index first');

  const { rows } = await query("INSERT INTO tags (name, slug) VALUES ('flagship', 'flagship') RETURNING id");
  await query('INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2)', [D.galaxy, rows[0].id]);
  assert.deepEqual(await rankIds('flagship', 'bm25'), [D.galaxy], 'tags are indexed');
});

test('BM25 ranks by term weight: rarer terms and title matches win', async () => {
  // "android" is in two docs, "pixel" in two; the Pixel has both, the title match outranks the case.
  const ids = await rankIds('pixel android', 'bm25');
  assert.equal(ids[0], D.pixel);
  assert.ok(ids.includes(D.galaxy) && ids.includes(D.case));
  const terms = await queryTerms('galaxy', 'bm25');
  assert.equal(terms.length, 1);
  assert.ok(terms[0].weight > 0);
  // Vietnamese without accents finds the Vietnamese title.
  assert.deepEqual(await rankIds('tai nghe khong day', 'bm25', { kind: null }), [D.buds]);
  // TF-IDF ranker also puts the title match first, and drafts are never returned.
  assert.equal((await rankIds('pixel', 'tfidf'))[0], D.pixel);
  assert.ok(!(await rankIds('leak', 'bm25')).includes(D.draft));
});

test('unknown words expand by prefix; words with no match return nothing', async () => {
  const terms = await queryTerms('galax', 'bm25');
  assert.deepEqual(terms.map((t) => t.term), ['galaxy']);
  assert.deepEqual(await rankIds('zzqx', 'bm25'), []);
});

test('GET /documents ranks by relevance by default when q is given and returns a searchId', async () => {
  const res = await request(app).get('/api/documents?q=pixel%20android');
  assert.equal(res.status, 200);
  assert.equal(res.body.items[0].slug, 'pixel');
  assert.ok(res.body.items.every((i) => typeof i.score === 'number'));
  assert.ok(Number.isInteger(res.body.searchId));
  const newest = await request(app).get('/api/documents?q=pixel%20android&sort=newest');
  assert.deepEqual(newest.body.items.map((i) => i.slug), ['case', 'galaxy', 'pixel']);
  const { rows } = await query('SELECT result_ids, result_offset, sort FROM search_click_log WHERE id = $1', [res.body.searchId]);
  assert.deepEqual(rows[0].result_ids, res.body.items.map((i) => i.id));
  assert.equal(rows[0].result_offset, 0);
  assert.equal(rows[0].sort, 'relevance');
  // relevance without q falls back to newest
  const noQ = await request(app).get('/api/documents?sort=relevance');
  assert.equal(noQ.status, 200);
  assert.equal(noQ.body.searchId, undefined);
});

test('a click with searchId is linked and gets its rank from the logged results (page offset included)', async () => {
  const s = await request(app).get('/api/documents?q=phone&limit=1&page=2');
  const shown = s.body.items[0].id;
  const c = await request(app).post('/api/search/click').send({ query: 'tampered', docId: shown, searchId: s.body.searchId });
  assert.equal(c.status, 200);
  assert.equal(c.body.rank, 2);
  const { rows } = await query('SELECT * FROM search_click_log WHERE search_id = $1', [s.body.searchId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clicked_rank, 2);
  assert.equal(rows[0].query_string, 'phone', 'query text comes from the search row');
  // a doc that was not shown is linked but has no rank; a bogus searchId is ignored
  const other = (await request(app).post('/api/search/click').send({ query: 'x', docId: D.buds, searchId: s.body.searchId })).body;
  assert.equal(other.rank, null);
  assert.equal((await request(app).post('/api/search/click').send({ query: 'x', docId: D.buds, searchId: 99999999 })).status, 200);
});

test('metrics: precision, recall, reciprocal rank, AP, nDCG', () => {
  const gains = new Map([[1, 3], [2, 1]]);
  const ranked = [5, 1, 6, 2];
  assert.equal(precisionAt(ranked, gains, 2), 0.5);
  assert.equal(recallAt(ranked, gains, 2), 0.5);
  assert.equal(reciprocalRank(ranked, gains), 0.5);
  assert.equal(averagePrecisionAt(ranked, gains, 4), (1 / 2 + 2 / 4) / 2);
  const dcg = 3 / Math.log2(3) + 1 / Math.log2(5);
  const idcg = 3 / Math.log2(2) + 1 / Math.log2(3);
  assert.ok(Math.abs(ndcgAt(ranked, gains, 4) - dcg / idcg) < 1e-12);
  assert.equal(ndcgAt([1, 2], gains, 2), 1);
  assert.equal(ndcgAt([7, 8], gains, 2), 0);
});

test('judgments group clicks by normalised query; evaluation scores every ranker', async () => {
  await query('DELETE FROM search_click_log');
  await query(`INSERT INTO search_click_log (query_string, clicked_doc_id) VALUES
    ('Pixel', $1), ('pixel', $1), ('PIXELS', $2), ('earbuds', $3), ('', $3)`, [D.pixel, D.case, D.buds]);
  const j = await loadJudgments();
  assert.deepEqual(j.map((x) => x.key), ['earbud', 'pixel']);
  const pixel = j.find((x) => x.key === 'pixel');
  assert.equal(pixel.gains.get(D.pixel), 2);
  assert.equal(pixel.gains.get(D.case), 1);

  const ev = await offlineEvaluation({ k: 5 });
  assert.equal(ev.queries, 2);
  assert.deepEqual(Object.keys(ev.summary), ['bm25', 'tfidf', 'baseline']);
  assert.equal(ev.summary.bm25.recall, 1);
  assert.ok(ev.summary.bm25.ndcg > 0.9);
});

test('online metrics come from linked clicks', async () => {
  await query('DELETE FROM search_click_log');
  const a = (await request(app).get('/api/documents?q=phone')).body;
  await request(app).get('/api/documents?q=pixel');
  await request(app).post('/api/search/click').send({ docId: a.items[1].id, searchId: a.searchId });
  const on = await onlineEvaluation();
  assert.equal(on.searches, 2);
  assert.equal(on.rankedSearches, 2);
  assert.equal(on.clickThroughRate, 0.5);
  assert.equal(on.mrr, 0.25);
  assert.equal(on.meanClickedRank, 2);
  assert.deepEqual(on.clicksByRank, [{ rank: '2', clicks: 1 }]);
});

test('dashboard search-eval and search-explain need db.view', async () => {
  assert.equal((await request(app).get('/api/db/search-eval')).status, 401);
  const customer = await loginAs('customer');
  assert.equal((await customer.get('/api/db/search-eval')).status, 403);
  const mgr = await loginAs('store_manager');
  const ev = await mgr.get('/api/db/search-eval?k=5');
  assert.equal(ev.status, 200);
  for (const key of ['index', 'offline', 'online']) assert.ok(key in ev.body, key);
  assert.equal(ev.body.offline.k, 5);
  assert.equal((await mgr.get('/api/db/search-eval?k=0')).status, 400);
  const ex = await mgr.get('/api/db/search-explain?q=Pixel%20Phones');
  assert.equal(ex.status, 200);
  assert.deepEqual(ex.body.tokens, ['pixel', 'phone']);
  assert.equal(ex.body.rankers.bm25[0].title, 'Google Pixel 8 Pro');
  assert.equal((await mgr.get('/api/db/search-explain')).status, 400);
});
