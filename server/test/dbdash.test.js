import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';

const agents = {};
const ROLES = ['super_admin', 'store_manager', 'content_manager', 'moderator', 'seo_specialist', 'customer'];
const ENDPOINTS = ['summary', 'tags', 'categories', 'products', 'search-log'];
let p1;
let p2;
let p3;
let art;
let c1;
let c2;
let c3;
const userIdOf = async (email) => (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
const ins = async (sql, params) => (await query(sql, params)).rows[0].id;
const titles = (res) => res.body.items.map((i) => i.title);

before(async () => {
  await resetDb();
  for (const r of ROLES) agents[r] = await loginAs(r);
  const phones = await ins("SELECT id FROM categories WHERE slug = 'phones'", []);
  const laptops = await ins("SELECT id FROM categories WHERE slug = 'laptops'", []);
  const linh = await userIdOf('linh@shop.test');
  const minh = await userIdOf('minh@shop.test');
  const mk = (title, slug, status, price, stock, brand, cat, views) => ins(
    `INSERT INTO documents (title, slug, status, price, stock, brand, category_id, views_count, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'product') RETURNING id`,
    [title, slug, status, price, stock, brand, cat, views],
  );
  p1 = await mk('Café Phone', 'cafe-phone', 'published', 100.5, 20, 'Acme', phones, 5);
  p2 = await mk('Zeta Laptop', 'zeta-laptop', 'draft', 900, 5, 'Globex', laptops, 50);
  p3 = await mk('Alpha Gadget', 'alpha-gadget', 'published', null, 0, null, null, 1);
  art = await ins("INSERT INTO documents (title, slug, status, kind) VALUES ('Some Article', 'some-article', 'published', 'article') RETURNING id", []);
  const tWifi = await ins("INSERT INTO tags (name, slug) VALUES ('Wireless Charging', 'wireless-charging') RETURNING id", []);
  const tOld = await ins("INSERT INTO tags (name, slug) VALUES ('Budget', 'budget') RETURNING id", []);
  await query('INSERT INTO document_tags (document_id, tag_id, added_by) VALUES ($1, $2, $3), ($4, $2, NULL), ($1, $5, NULL), ($6, $2, NULL)',
    [p1, tWifi, linh, p2, tOld, art]);
  c1 = await ins("INSERT INTO comments (document_id, user_id, body, created_at) VALUES ($1, $2, 'top one', now() - interval '3 hours') RETURNING id", [p1, linh]);
  c2 = await ins("INSERT INTO comments (document_id, user_id, parent_id, body, status, created_at) VALUES ($1, $2, $3, 'reply', 'hidden', now() - interval '2 hours') RETURNING id", [p1, minh, c1]);
  c3 = await ins("INSERT INTO comments (document_id, user_id, parent_id, body, status, created_at) VALUES ($1, $2, $3, 'reply 2', 'spam', now() - interval '1 hours') RETURNING id", [p1, linh, c1]);
  await query('INSERT INTO comments (document_id, user_id, body) VALUES ($1, $2, $3)', [art, linh, 'on article']);
  await query('INSERT INTO ratings (user_id, document_id, value) VALUES ($1, $3, 5), ($2, $3, 4)', [linh, minh, p1]);
  await query('INSERT INTO ratings (user_id, document_id, value) VALUES ($1, $3, 5), ($2, $3, 4)', [linh, minh, p2]);
  await query('INSERT INTO likes (user_id, document_id) VALUES ($1, $2)', [linh, p1]);
  await query("INSERT INTO search_click_log (user_id, query_string, clicked_doc_id, result_count, \"timestamp\") VALUES ($1, 'phone', $2, 3, now() - interval '3 hours')", [linh, p1]);
  await query("INSERT INTO search_click_log (user_id, query_string, result_count, \"timestamp\") VALUES (NULL, 'Laptop 100%', 0, now() - interval '2 hours')", []);
  await query("INSERT INTO search_click_log (user_id, query_string, result_count, \"timestamp\") VALUES ($1, 'zzz', 0, now() - interval '1 hours')", [minh]);
});
after(() => pool.end());

test('anonymous gets 401, other roles 403, super_admin and store_manager 200 on every endpoint', async () => {
  const paths = [...ENDPOINTS, `products/${p1}`, `products/${p1}/comments`].map((e) => `/api/db/${e}`);
  for (const path of paths) {
    assert.equal((await request(app).get(path)).status, 401, path);
    for (const role of ROLES) {
      const res = await agents[role].get(path);
      assert.equal(res.status, ['super_admin', 'store_manager'].includes(role) ? 200 : 403, `${role} ${path}`);
    }
  }
});

test('summary counts products, stock, comments and log rows', async () => {
  const res = await agents.store_manager.get('/api/db/summary');
  assert.deepEqual(res.body, { products: 3, in_stock: 2, out_of_stock: 1, units: 25, tags: 2, comments: 3, log_rows: 3 });
});

test('tags and categories carry product counts only', async () => {
  const tags = (await agents.store_manager.get('/api/db/tags')).body.items;
  assert.deepEqual(tags.map((t) => [t.name, t.product_count]), [['Budget', 1], ['Wireless Charging', 2]]);
  const cats = (await agents.store_manager.get('/api/db/categories')).body.items;
  assert.equal(cats.length, 8);
  assert.equal(cats.find((c) => c.slug === 'phones').product_count, 1);
  assert.equal(cats.find((c) => c.slug === 'monitors').product_count, 0);
  assert.deepEqual(cats.map((c) => c.name), [...cats.map((c) => c.name)].sort());
});

test('products list shape includes drafts, excludes articles, numeric price', async () => {
  const res = await agents.store_manager.get('/api/db/products');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pages, 1);
  const item = res.body.items.find((i) => i.id === p1);
  assert.equal(item.price, 100.5);
  assert.equal(item.category, 'Phones');
  assert.equal(item.category_slug, 'phones');
  assert.deepEqual(item.tags, ['Budget', 'Wireless Charging']);
  assert.equal(item.comment_count, 3);
  const none = res.body.items.find((i) => i.id === p3);
  assert.equal(none.price, null);
  assert.equal(none.category, null);
  assert.deepEqual(none.tags, []);
  assert.ok(!res.body.items.some((i) => i.id === art));
  assert.equal(res.body.items.find((i) => i.id === p2).status, 'draft');
});

test('products search: title, accent-insensitive, tag name, brand, numeric id', async () => {
  const get = (q) => agents.store_manager.get('/api/db/products').query({ q });
  assert.deepEqual(titles(await get('zeta')), ['Zeta Laptop']);
  assert.deepEqual(titles(await get('cafe')), ['Café Phone']);
  assert.deepEqual(titles(await get('CAFÉ')), ['Café Phone']);
  assert.deepEqual((await get('wireless charg')).body.items.map((i) => i.id).sort(), [p1, p2].sort());
  assert.deepEqual(titles(await get('globex')), ['Zeta Laptop']);
  assert.deepEqual(titles(await get(String(p3))), ['Alpha Gadget']);
  assert.equal((await get('x'.repeat(101))).status, 400);
});

test('products filters: tag, category, stock', async () => {
  const get = (params) => agents.store_manager.get('/api/db/products').query(params);
  assert.equal((await get({ tag: 'budget' })).body.total, 1);
  assert.equal((await get({ tag: 'wireless-charging' })).body.total, 2);
  assert.deepEqual(titles(await get({ category: 'laptops' })), ['Zeta Laptop']);
  assert.deepEqual(titles(await get({ stock: 'in', sort: 'title' })), ['Café Phone', 'Zeta Laptop']);
  assert.deepEqual(titles(await get({ stock: 'low' })), ['Zeta Laptop']);
  assert.deepEqual(titles(await get({ stock: 'out' })), ['Alpha Gadget']);
  assert.equal((await get({ stock: 'lots' })).status, 400);
});

test('products sorts: each accepted, order checked, bad sort 400', async () => {
  const sorted = async (sort) => titles(await agents.store_manager.get('/api/db/products').query({ sort }));
  for (const s of ['newest', 'title', 'stock_asc', 'stock_desc', 'price_asc', 'price_desc', 'views', 'comments']) {
    assert.equal((await agents.store_manager.get('/api/db/products').query({ sort: s })).status, 200, s);
  }
  assert.deepEqual(await sorted('title'), ['Alpha Gadget', 'Café Phone', 'Zeta Laptop']);
  assert.deepEqual(await sorted('stock_asc'), ['Alpha Gadget', 'Zeta Laptop', 'Café Phone']);
  assert.deepEqual(await sorted('stock_desc'), ['Café Phone', 'Zeta Laptop', 'Alpha Gadget']);
  assert.deepEqual(await sorted('price_asc'), ['Café Phone', 'Zeta Laptop', 'Alpha Gadget']);
  assert.deepEqual(await sorted('price_desc'), ['Zeta Laptop', 'Café Phone', 'Alpha Gadget']);
  assert.deepEqual(await sorted('views'), ['Zeta Laptop', 'Café Phone', 'Alpha Gadget']);
  assert.equal((await sorted('comments'))[0], 'Café Phone');
  assert.equal((await agents.store_manager.get('/api/db/products?sort=price; DROP TABLE documents')).status, 400);
  assert.equal((await agents.store_manager.get('/api/db/products?sort=constructor')).status, 400);
});

test('products pagination', async () => {
  const res = await agents.store_manager.get('/api/db/products?limit=2&page=2&sort=title');
  assert.deepEqual(titles(res), ['Zeta Laptop']);
  assert.equal(res.body.pages, 2);
  assert.equal((await agents.store_manager.get('/api/db/products?limit=101')).status, 400);
  assert.equal((await agents.store_manager.get('/api/db/products?page=0')).status, 400);
});

test('product detail shape; 404 for article, missing and bad ids', async () => {
  const res = await agents.store_manager.get(`/api/db/products/${p1}`);
  assert.equal(res.status, 200);
  const d = res.body;
  for (const k of ['id', 'title', 'title_vi', 'slug', 'brand', 'category', 'category_slug', 'price', 'compare_at_price', 'stock',
    'views_count', 'status', 'author', 'summary', 'image_url', 'image_alt', 'created_at', 'updated_at', 'tags', 'comment_count',
    'reply_count', 'rating_avg', 'rating_count', 'like_count']) assert.ok(k in d, k);
  assert.equal(d.price, 100.5);
  assert.equal(d.comment_count, 3);
  assert.equal(d.reply_count, 2);
  assert.equal(d.rating_avg, 4.5);
  assert.equal(d.rating_count, 2);
  assert.equal(d.like_count, 1);
  assert.deepEqual(d.tags.map((t) => [t.name, t.added_by]), [['Budget', null], ['Wireless Charging', 'Linh Tran']]);
  assert.equal((await agents.store_manager.get(`/api/db/products/${p3}`)).body.rating_avg, null);
  assert.equal((await agents.store_manager.get(`/api/db/products/${art}`)).status, 404);
  assert.equal((await agents.store_manager.get('/api/db/products/999999')).status, 404);
  assert.equal((await agents.store_manager.get('/api/db/products/abc')).status, 404);
  assert.equal((await agents.store_manager.get(`/api/db/products/${art}/comments`)).status, 404);
});

test('product comments include every status with reply_count and parent_id', async () => {
  const res = await agents.store_manager.get(`/api/db/products/${p1}/comments`);
  assert.equal(res.body.total, 3);
  assert.deepEqual(res.body.items.map((c) => c.id), [c3, c2, c1]);
  assert.deepEqual(res.body.items.map((c) => c.status), ['spam', 'hidden', 'visible']);
  assert.deepEqual(res.body.items.map((c) => c.parent_id), [c1, c1, null]);
  assert.deepEqual(res.body.items.map((c) => c.reply_count), [0, 0, 2]);
  assert.equal(res.body.items[2].author, 'Linh Tran');
  assert.equal(res.body.items[2].body, 'top one');
  const top = await agents.store_manager.get(`/api/db/products/${p1}/comments?top=1`);
  assert.deepEqual(top.body.items.map((c) => c.id), [c1]);
});

test('search log lists with names and titles, filters by q and clicked', async () => {
  const get = (params) => agents.store_manager.get('/api/db/search-log').query(params);
  const all = await get({});
  assert.equal(all.body.total, 3);
  assert.deepEqual(all.body.items.map((i) => i.query_string), ['zzz', 'Laptop 100%', 'phone']);
  assert.equal(all.body.items[1].user_name, null);
  assert.equal(all.body.items[2].user_name, 'Linh Tran');
  assert.equal(all.body.items[2].clicked_title, 'Café Phone');
  assert.equal(all.body.items[2].clicked_doc_id, p1);
  assert.equal(all.body.items[1].clicked_title, null);
  assert.deepEqual((await get({ q: 'LAPTOP' })).body.items.map((i) => i.query_string), ['Laptop 100%']);
  assert.equal((await get({ q: '%' })).body.total, 1);
  assert.equal((await get({ q: '_' })).body.total, 0);
  assert.equal((await get({ clicked: 'yes' })).body.total, 1);
  assert.equal((await get({ clicked: 'no' })).body.total, 2);
  assert.equal((await get({ clicked: 'maybe' })).status, 400);
  assert.equal((await get({ q: 'x'.repeat(101) })).status, 400);
});

test('no write methods on /api/db', async () => {
  for (const method of ['post', 'put', 'patch', 'delete']) {
    for (const path of ['/api/db/products', `/api/db/products/${p1}`, '/api/db/summary', '/api/db/search-log']) {
      const res = await agents.super_admin[method](path).send({});
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  }
  assert.equal((await query('SELECT count(*)::int n FROM documents')).rows[0].n, 4);
});

test('injection-ish and wildcard q values return 200 without spurious matches', async () => {
  for (const q of ["' OR 1=1 --", '%', '_', "'; DROP TABLE documents; --", '\\']) {
    const products = await agents.store_manager.get('/api/db/products').query({ q });
    assert.equal(products.status, 200, q);
    assert.equal(products.body.total, 0, q);
    const log = await agents.store_manager.get('/api/db/search-log').query({ q: q === '%' ? '%%x' : q });
    assert.equal(log.status, 200, q);
  }
  assert.equal((await query('SELECT count(*)::int n FROM documents')).rows[0].n, 4);
});
