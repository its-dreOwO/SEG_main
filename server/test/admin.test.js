import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';

const agents = {};
const ROLES = ['super_admin', 'content_manager', 'moderator', 'seo_specialist', 'customer'];
const AREAS = {
  super_admin: ['/api/admin/users', '/api/admin/roles', '/api/admin/logs', '/api/admin/settings'],
  content_manager: ['/api/admin/documents', '/api/admin/categories', '/api/admin/tags'],
  moderator: ['/api/admin/comments', '/api/admin/flags'],
  seo_specialist: ['/api/admin/seo', '/api/admin/analytics'],
};
let docId;
let userId;
const userIdOf = async (email) => (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

before(async () => {
  await resetDb();
  for (const r of ROLES) agents[r] = await loginAs(r);
  docId = (await query("INSERT INTO documents (title, slug, status, price, stock) VALUES ('Doc', 'doc', 'published', 5, 3) RETURNING id")).rows[0].id;
  userId = await userIdOf('linh@shop.test');
});
after(() => pool.end());

test('each role gets 200 on its own areas and 403 on the others; customer 403 everywhere; anonymous 401', async () => {
  for (const role of ROLES) {
    for (const [owner, paths] of Object.entries(AREAS)) {
      for (const p of paths) {
        const res = await agents[role].get(p);
        assert.equal(res.status, owner === role ? 200 : 403, `${role} ${p}`);
      }
    }
  }
  assert.equal((await request(app).get('/api/admin/users')).status, 401);
});

test('admin lists paginate', async () => {
  const res = await agents.super_admin.get('/api/admin/users?limit=2&page=2');
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.total, 7);
  assert.equal(res.body.pages, 4);
});

test('document content is sanitised on save; all fields saved with tags', async () => {
  const res = await agents.content_manager.post('/api/admin/documents').send({
    title: 'New Phone', title_vi: 'Điện thoại mới', summary: 's', summary_vi: 'sv',
    content: '<p onclick="x()">hi</p><script>alert(1)</script><b>ok</b>', content_vi: '<img src=x onerror=alert(1)>vi',
    price: 99.5, compare_at_price: 120, stock: 4, brand: 'Acme', image_url: '/img/a.png', kind: 'product',
    status: 'draft', tags: ['Wireless', 'Budget'],
  });
  assert.equal(res.status, 201);
  assert.ok(!/script|onclick/.test(res.body.content));
  assert.match(res.body.content, /<b>ok<\/b>/);
  assert.ok(!/onerror/.test(res.body.content_vi));
  const row = (await query('SELECT * FROM documents WHERE id = $1', [res.body.id])).rows[0];
  assert.equal(row.brand, 'Acme');
  assert.equal(Number(row.price), 99.5);
  assert.equal(row.stock, 4);
  assert.equal((await query('SELECT count(*)::int AS n FROM document_tags WHERE document_id = $1', [res.body.id])).rows[0].n, 2);
  const up = await agents.content_manager.put(`/api/admin/documents/${res.body.id}`).send({ content: '<script>x</script>fine', tags: ['Wireless'] });
  assert.equal(up.status, 200);
  assert.equal(up.body.content, 'fine');
  assert.equal((await query('SELECT count(*)::int AS n FROM document_tags WHERE document_id = $1', [res.body.id])).rows[0].n, 1);
  assert.equal((await agents.content_manager.post('/api/admin/documents').send({ title: '' })).status, 400);
});

test('publish makes a product visible and unpublish hides it; delete works', async () => {
  const c = agents.content_manager;
  const created = await c.post('/api/admin/documents').send({ title: 'Pub Test', price: 10, status: 'draft' });
  const slug = created.body.slug;
  const id = created.body.id;
  assert.equal((await request(app).get(`/api/documents/${slug}`)).status, 404);
  assert.equal((await c.put(`/api/admin/documents/${id}`).send({ status: 'published' })).status, 200);
  assert.equal((await request(app).get(`/api/documents/${slug}`)).status, 200);
  assert.equal((await c.put(`/api/admin/documents/${id}`).send({ status: 'draft' })).status, 200);
  assert.equal((await request(app).get(`/api/documents/${slug}`)).status, 404);
  assert.equal((await c.delete(`/api/admin/documents/${id}`)).status, 200);
  assert.equal((await c.get(`/api/admin/documents/${id}`)).status, 404);
});

test('hiding a comment removes it from the detail response; spam and flag resolve', async () => {
  const cid = (await query("INSERT INTO comments (document_id, user_id, body) VALUES ($1, $2, 'rude') RETURNING id", [docId, userId])).rows[0].id;
  assert.equal((await request(app).get('/api/documents/doc')).body.comments.length, 1);
  const m = agents.moderator;
  assert.equal((await m.patch(`/api/admin/comments/${cid}`).send({ status: 'hidden' })).status, 200);
  assert.equal((await request(app).get('/api/documents/doc')).body.comments.length, 0);
  assert.equal((await m.patch(`/api/admin/comments/${cid}`).send({ status: 'bogus' })).status, 400);
  assert.equal((await m.post(`/api/admin/comments/${cid}/spam`)).status, 200);
  assert.equal((await query('SELECT status FROM comments WHERE id = $1', [cid])).rows[0].status, 'spam');
  const fid = (await query("INSERT INTO flags (comment_id, reporter_id, reason) VALUES ($1, $2, 'bad') RETURNING id", [cid, userId])).rows[0].id;
  assert.equal((await m.get('/api/admin/flags')).body.items.length, 1);
  assert.equal((await m.post(`/api/admin/flags/${fid}/resolve`).send({ resolution: 'dismissed' })).status, 200);
  assert.equal((await m.get('/api/admin/flags')).body.items.length, 0);
});

test('a Super Admin cannot deactivate themselves; others can be deactivated', async () => {
  const s = agents.super_admin;
  const self = await userIdOf('admin@shop.test');
  assert.equal((await s.patch(`/api/admin/users/${self}/active`).send({ active: false })).status, 400);
  assert.equal((await query('SELECT active FROM users WHERE id = $1', [self])).rows[0].active, true);
  const minh = await userIdOf('minh@shop.test');
  assert.equal((await s.patch(`/api/admin/users/${minh}/active`).send({ active: false })).status, 200);
  assert.equal((await query('SELECT active FROM users WHERE id = $1', [minh])).rows[0].active, false);
});

test('a role change writes a system_logs row', async () => {
  const hannah = await userIdOf('hannah@shop.test');
  const before = (await query('SELECT count(*)::int AS n FROM system_logs')).rows[0].n;
  const res = await agents.super_admin.patch(`/api/admin/users/${hannah}/role`).send({ role: 'moderator' });
  assert.equal(res.status, 200);
  const logs = (await query("SELECT * FROM system_logs WHERE action LIKE '%role%' ORDER BY id DESC")).rows;
  assert.ok((await query('SELECT count(*)::int AS n FROM system_logs')).rows[0].n > before);
  assert.ok(logs.length >= 1);
  assert.equal((await agents.super_admin.patch(`/api/admin/users/${hannah}/role`).send({ role: 'nope' })).status, 400);
});

test('role permissions can be read and set; settings read and update', async () => {
  const s = agents.super_admin;
  const roles = (await s.get('/api/admin/roles')).body;
  const cust = roles.find((r) => r.name === 'customer');
  assert.deepEqual(cust.permissions, []);
  assert.equal((await s.put(`/api/admin/roles/${cust.id}/permissions`).send({ permissions: ['analytics.view'] })).status, 200);
  assert.deepEqual((await s.get('/api/admin/roles')).body.find((r) => r.name === 'customer').permissions, ['analytics.view']);
  assert.equal((await s.put(`/api/admin/roles/${cust.id}/permissions`).send({ permissions: ['x.y'] })).status, 400);
  await s.put(`/api/admin/roles/${cust.id}/permissions`).send({ permissions: [] });
  assert.equal((await s.put('/api/admin/settings').send({ vnd_rate: '26000' })).status, 200);
  assert.equal((await s.get('/api/admin/settings')).body.vnd_rate, '26000');
  assert.equal((await s.put('/api/admin/settings').send({ unknown_key: 'x' })).status, 400);
  assert.ok((await s.get('/api/admin/logs')).body.items.length > 0);
});

test('deleting a category in use returns 409; unused deletes; categories and tags CRUD', async () => {
  const c = agents.content_manager;
  const cat = await c.post('/api/admin/categories').send({ name: 'Cables', name_vi: 'Cáp' });
  assert.equal(cat.status, 201);
  await query('UPDATE documents SET category_id = $1 WHERE id = $2', [cat.body.id, docId]);
  assert.equal((await c.delete(`/api/admin/categories/${cat.body.id}`)).status, 409);
  await query('UPDATE documents SET category_id = NULL WHERE id = $1', [docId]);
  assert.equal((await c.put(`/api/admin/categories/${cat.body.id}`).send({ name: 'Cables2' })).status, 200);
  assert.equal((await c.delete(`/api/admin/categories/${cat.body.id}`)).status, 200);
  const tag = await c.post('/api/admin/tags').send({ name: 'Gaming' });
  assert.equal(tag.status, 201);
  assert.equal((await c.put(`/api/admin/tags/${tag.body.id}`).send({ name: 'Gaming Pro' })).status, 200);
  assert.equal((await c.delete(`/api/admin/tags/${tag.body.id}`)).status, 200);
});

test('seo/:id updates SEO fields only; SEO role cannot change price', async () => {
  const q = agents.seo_specialist;
  const res = await q.put(`/api/admin/seo/${docId}`).send({ seo_title: 'T', seo_description: 'D', seo_keywords: 'k', image_alt: 'alt', price: 1, stock: 99, title: 'hacked' });
  assert.equal(res.status, 200);
  const row = (await query('SELECT * FROM documents WHERE id = $1', [docId])).rows[0];
  assert.equal(row.seo_title, 'T');
  assert.equal(row.image_alt, 'alt');
  assert.equal(Number(row.price), 5);
  assert.equal(row.stock, 3);
  assert.equal(row.title, 'Doc');
  assert.equal((await q.put(`/api/admin/documents/${docId}`).send({ price: 1 })).status, 403);
});

test('analytics returns the expected shape; zero-result searches use result_count', async () => {
  await request(app).get('/api/documents?q=doc');
  await request(app).get('/api/documents?q=zzzznothing');
  await request(app).post('/api/search/click').send({ query: 'doc', docId });
  await query('INSERT INTO page_views (document_id) VALUES ($1)', [docId]);
  const res = await agents.seo_specialist.get('/api/admin/analytics');
  assert.equal(res.status, 200);
  for (const k of ['totals', 'topViewed', 'topSearches', 'zeroResultSearches', 'clickThrough', 'viewsByDay']) assert.ok(k in res.body, k);
  assert.ok(res.body.zeroResultSearches.some((r) => r.query === 'zzzznothing'));
  assert.ok(!res.body.zeroResultSearches.some((r) => r.query === 'doc'));
  assert.ok(res.body.topSearches.some((r) => r.query === 'doc'));
  assert.ok(res.body.viewsByDay.length >= 1);
  assert.equal(res.body.clickThrough.clicks, 1);
});

test('a user cannot change their own role', async () => {
  const self = await userIdOf('admin@shop.test');
  assert.equal((await agents.super_admin.patch(`/api/admin/users/${self}/role`).send({ role: 'customer' })).status, 400);
  assert.equal((await query('SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [self])).rows[0].name, 'super_admin');
});

test('super_admin cannot lose roles.manage or users.manage', async () => {
  const s = agents.super_admin;
  const sa = (await s.get('/api/admin/roles')).body.find((r) => r.name === 'super_admin');
  const put = (perms) => s.put(`/api/admin/roles/${sa.id}/permissions`).send({ permissions: perms });
  assert.equal((await put(sa.permissions.filter((c) => c !== 'roles.manage'))).status, 400);
  assert.equal((await put(sa.permissions.filter((c) => c !== 'users.manage'))).status, 400);
  assert.deepEqual((await s.get('/api/admin/roles')).body.find((r) => r.name === 'super_admin').permissions, sa.permissions);
  assert.equal((await put(sa.permissions.filter((c) => c !== 'logs.view'))).status, 200);
  assert.equal((await put(sa.permissions)).status, 200);
});
