import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../src/db.js';
import { resetDb } from './helpers.js';

before(resetDb);
after(() => pool.end());

const columns = async (table) =>
  (await query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])).rows.map(
    (r) => r.column_name,
  );

test('documents has the required and extended columns', async () => {
  const cols = await columns('documents');
  for (const c of ['id', 'title', 'content', 'summary', 'category_id', 'author', 'created_at', 'views_count',
    'kind', 'title_vi', 'summary_vi', 'content_vi', 'slug', 'price', 'status', 'document_search']) {
    assert.ok(cols.includes(c), `missing documents.${c}`);
  }
});

test('search_click_log has the required columns', async () => {
  const cols = await columns('search_click_log');
  for (const c of ['user_id', 'query_string', 'clicked_doc_id', 'timestamp']) assert.ok(cols.includes(c), c);
});

test('every table in the data model exists', async () => {
  for (const t of ['tags', 'document_tags', 'categories', 'users', 'roles', 'permissions', 'role_permissions',
    'comments', 'ratings', 'likes', 'flags', 'orders', 'order_items', 'system_logs', 'settings', 'page_views']) {
    assert.ok((await columns(t)).length > 0, `missing table ${t}`);
  }
});

const permsOf = async (role) =>
  (await query(
    `SELECT p.code FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id WHERE r.name = $1 ORDER BY p.code`, [role],
  )).rows.map((r) => r.code);

test('roles carry their expected permission codes', async () => {
  assert.deepEqual(await permsOf('super_admin'), ['logs.view', 'roles.manage', 'settings.manage', 'users.manage']);
  assert.deepEqual(await permsOf('content_manager'), ['content.manage', 'taxonomy.manage']);
  assert.deepEqual(await permsOf('moderator'), ['moderation.manage']);
  assert.deepEqual(await permsOf('seo_specialist'), ['analytics.view', 'seo.manage']);
  assert.deepEqual(await permsOf('customer'), []);
});

test('seed creates staff, customers, 8 categories and settings', async () => {
  const staff = await query(`SELECT count(*)::int n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name <> 'customer'`);
  assert.equal(staff.rows[0].n, 4);
  assert.ok((await query(`SELECT count(*)::int n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='customer'`)).rows[0].n >= 2);
  assert.equal((await query('SELECT count(*)::int n FROM categories')).rows[0].n, 8);
  const s = Object.fromEntries((await query('SELECT key, value FROM settings')).rows.map((r) => [r.key, r.value]));
  assert.equal(s.vnd_rate, '25000');
  assert.equal(s.comment_moderation, 'off');
  assert.ok(s.store_name && s.promo_banner);
});

test('no plaintext passwords are stored', async () => {
  const { rows } = await query('SELECT password_hash FROM users');
  for (const r of rows) assert.match(r.password_hash, /^\$2[aby]\$/);
});

test('document_search ignores case and Vietnamese diacritics', async () => {
  await query(`INSERT INTO documents (title, title_vi, slug) VALUES ('Speaker', 'Loa Đẹp Nhất Việt', 'x')`);
  const { rows } = await query(`SELECT 1 FROM documents WHERE document_search LIKE '%' || lower(f_unaccent($1)) || '%'`, ['DEP nhat viet']);
  assert.equal(rows.length, 1);
});

test('constraints: one order token per user, enum checks', async () => {
  const u = (await query(`SELECT id FROM users LIMIT 1`)).rows[0].id;
  const ins = () => query(`INSERT INTO orders (user_id, client_token, total, customer_name, address) VALUES ($1,'t',1,'n','a')`, [u]);
  await ins();
  await assert.rejects(ins, /unique/);
  await assert.rejects(() => query(`INSERT INTO documents (title, slug, status) VALUES ('a','y','bogus')`), /check/);
});

test('resetDb refuses a non-test environment', async () => {
  const saved = process.env.TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = 'postgres://x:y@localhost:1/shop';
  await assert.rejects(resetDb, /refused/);
  process.env.TEST_DATABASE_URL = saved;
});
