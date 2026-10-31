import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';

const D = {};
let tagId;

async function addDoc(key, f) {
  const { rows } = await query(
    `INSERT INTO documents (kind, title, title_vi, slug, content, summary, category_id, author, price, compare_at_price,
       stock, brand, image_url, status, created_at, views_count, seo_title)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT id FROM categories WHERE slug = $7),$8,$9,$10,$11,$12,$13,$14,$15,$16,'SEO '||$2)
     RETURNING id`,
    [f.kind || 'product', f.title, f.title_vi ?? null, key, f.content || '', f.summary || '', f.category || 'phones',
      'Staff', f.price ?? null, f.compare ?? null, 5, f.brand || 'Acme', '/img/x.jpg', f.status || 'published',
      f.created || '2026-01-01', f.views || 0],
  );
  D[key] = rows[0].id;
}

before(async () => {
  await resetDb();
  await addDoc('phone-a', { title: 'Phone A', price: 100, category: 'phones', created: '2026-01-01', views: 5 });
  await addDoc('phone-b', { title: 'Phone B', price: 300, category: 'phones', created: '2026-02-01', views: 50 });
  await addDoc('headset', { title: 'Wireless Headset', title_vi: 'Tai nghe không dây', price: 200, category: 'headphones', created: '2026-03-01', views: 20 });
  await addDoc('guide', { kind: 'article', title: 'Buying guide', title_vi: 'Hướng dẫn mua hàng', category: 'laptops', created: '2026-04-01', views: 1 });
  await addDoc('pct', { title: '100% Cotton Sleeve', price: 10, category: 'laptops', created: '2026-05-01' });
  await addDoc('secret', { title: 'Secret Draft Phone', status: 'draft', price: 1, category: 'phones', created: '2026-06-01' });
  const { rows } = await query("INSERT INTO tags (name, slug) VALUES ('gaming-gear', 'gaming-gear') RETURNING id");
  tagId = rows[0].id;
  await query('INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2)', [D['phone-b'], tagId]);
  // phone-a sells the most units
  const { rows: o } = await query("INSERT INTO orders (client_token, total, customer_name, address) VALUES ('t', 1, 'n', 'a') RETURNING id");
  await query("INSERT INTO order_items (order_id, document_id, title, unit_price, quantity) VALUES ($1,$2,'Phone A',100,7), ($1,$3,'Phone B',300,2)", [o[0].id, D['phone-a'], D['phone-b']]);
});
after(() => pool.end());

const slugs = (res) => res.body.items.map((i) => i.slug);

test('GET /api/settings/public', async () => {
  const res = await request(app).get('/api/settings/public');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['banner', 'moderation', 'storeName', 'vndRate']);
  assert.equal(res.body.storeName, 'Tech Store');
  assert.equal(res.body.vndRate, 25000);
  assert.equal(res.body.moderation, false);
});

test('list paginates with totals and exposes the agreed fields', async () => {
  const res = await request(app).get('/api/documents?limit=2&page=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 5);
  assert.equal(res.body.pages, 3);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.items.length, 2);
  const item = res.body.items[0];
  for (const k of ['id', 'slug', 'title', 'title_vi', 'summary', 'summary_vi', 'price', 'compare_at_price', 'image_url',
    'image_alt', 'brand', 'category', 'stock', 'created_at', 'views_count', 'author', 'rating', 'rating_count', 'kind']) {
    assert.ok(k in item, `missing ${k}`);
  }
  assert.equal(typeof item.rating_count, 'number');
});

test('default sort is newest first; draft never listed', async () => {
  const res = await request(app).get('/api/documents');
  assert.deepEqual(slugs(res), ['pct', 'guide', 'headset', 'phone-b', 'phone-a']);
});

test('filters narrow results', async () => {
  const get = async (qs) => slugs(await request(app).get(`/api/documents?${qs}`)).sort();
  assert.deepEqual(await get('category=headphones'), ['headset']);
  assert.deepEqual(await get('tag=gaming-gear'), ['phone-b']);
  assert.deepEqual(await get('kind=article'), ['guide']);
  assert.deepEqual(await get('minPrice=150&maxPrice=250'), ['headset']);
  assert.deepEqual(await get('minPrice=250'), ['phone-b']);
  assert.deepEqual(await get('from=2026-03-01&to=2026-04-01'), ['guide', 'headset']);
  assert.deepEqual(await get('q=wireless'), ['headset']);
  assert.equal((await request(app).get('/api/documents?kind=bogus')).status, 400);
  assert.equal((await request(app).get('/api/documents?minPrice=abc')).status, 400);
  assert.equal((await request(app).get('/api/documents?from=nope')).status, 400);
});

test('sort values', async () => {
  const get = async (s) => slugs(await request(app).get(`/api/documents?sort=${s}`));
  assert.deepEqual((await get('price_asc')).slice(0, 3), ['pct', 'phone-a', 'headset']);
  assert.deepEqual((await get('price_desc')).slice(0, 2), ['phone-b', 'headset']);
  assert.deepEqual((await get('top')).slice(0, 2), ['phone-a', 'phone-b']);
  assert.deepEqual((await get('views')).slice(0, 3), ['phone-b', 'headset', 'phone-a']);
  assert.equal((await request(app).get('/api/documents?sort=bogus')).status, 400);
});

test('search: draft excluded, % is literal, diacritics ignored, tags searched', async () => {
  assert.deepEqual(slugs(await request(app).get('/api/documents?q=secret')), []);
  assert.deepEqual(slugs(await request(app).get('/api/documents?q=%25')), ['pct']);
  assert.deepEqual(slugs(await request(app).get('/api/documents?q=_')), []);
  assert.deepEqual(slugs(await request(app).get('/api/documents?q=tai%20nghe')), ['headset']);
  assert.deepEqual(slugs(await request(app).get(`/api/documents?q=${encodeURIComponent('TAI NGHE KHÔNG')}`)), ['headset']);
  assert.deepEqual(slugs(await request(app).get(`/api/documents?q=${encodeURIComponent('hướng dẫn')}`)), ['guide']);
  assert.deepEqual(slugs(await request(app).get('/api/documents?q=gaming')), ['phone-b']);
});

test('a search writes a log row with null clicked_doc_id; guests have null user_id; empty q logs nothing', async () => {
  await query('DELETE FROM search_click_log');
  await request(app).get('/api/documents?q=phone');
  await request(app).get('/api/documents?q=');
  await request(app).get('/api/documents');
  let { rows } = await query('SELECT * FROM search_click_log');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query_string, 'phone');
  assert.equal(rows[0].clicked_doc_id, null);
  assert.equal(rows[0].user_id, null);

  const agent = await loginAs('customer');
  await agent.get('/api/documents?q=headset');
  ({ rows } = await query("SELECT user_id FROM search_click_log WHERE query_string = 'headset'"));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].user_id);
});

test('click writes a log row with the doc id', async () => {
  await query('DELETE FROM search_click_log');
  const res = await request(app).post('/api/search/click').send({ query: 'phone', docId: D['phone-a'] });
  assert.equal(res.status, 200);
  const { rows } = await query('SELECT * FROM search_click_log');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clicked_doc_id, D['phone-a']);
  assert.equal(rows[0].user_id, null);
  assert.equal((await request(app).post('/api/search/click').send({ query: 'x', docId: 'abc' })).status, 400);
  assert.equal((await request(app).post('/api/search/click').send({ query: 'x', docId: D.secret })).status, 404);
});

test('detail increments views, inserts page_view, returns extras; draft is 404', async () => {
  const before = (await query('SELECT views_count FROM documents WHERE id = $1', [D['phone-b']])).rows[0].views_count;
  const res = await request(app).get('/api/documents/phone-b');
  assert.equal(res.status, 200);
  assert.equal(res.body.slug, 'phone-b');
  for (const k of ['content', 'content_vi', 'tags', 'comments', 'liked', 'my_rating', 'seo_title', 'seo_description', 'seo_keywords', 'likes_count']) {
    assert.ok(k in res.body, `missing ${k}`);
  }
  assert.equal(res.body.liked, false);
  assert.equal(res.body.my_rating, null);
  assert.deepEqual(res.body.tags.map((t) => t.slug), ['gaming-gear']);
  assert.equal(res.body.views_count, before + 1);
  const pv = await query('SELECT count(*)::int AS n FROM page_views WHERE document_id = $1', [D['phone-b']]);
  assert.equal(pv.rows[0].n, 1);
  assert.equal((await request(app).get('/api/documents/secret')).status, 404);
  assert.equal((await request(app).get('/api/documents/nope')).status, 404);
});

test('categories and tags lists', async () => {
  const c = await request(app).get('/api/categories');
  assert.equal(c.status, 200);
  assert.equal(c.body.length, 8);
  assert.ok('slug' in c.body[0] && 'name' in c.body[0] && 'name_vi' in c.body[0]);
  const t = await request(app).get('/api/tags');
  assert.equal(t.status, 200);
  assert.ok(t.body.some((x) => x.slug === 'gaming-gear'));
});
