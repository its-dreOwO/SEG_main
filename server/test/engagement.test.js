import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';

let docId;
let draftId;
let a;
let b;
let anon;

before(async () => {
  await resetDb();
  docId = (await query("INSERT INTO documents (title, slug, status, price) VALUES ('Doc', 'doc', 'published', 5) RETURNING id")).rows[0].id;
  draftId = (await query("INSERT INTO documents (title, slug, status) VALUES ('Draft', 'draft', 'draft') RETURNING id")).rows[0].id;
  a = await loginAs('customer');
  b = await loginAs('moderator');
  anon = request(app);
});
after(() => pool.end());

test('anonymous writes get 401', async () => {
  for (const [m, p] of [['post', `/api/documents/${docId}/comments`], ['post', `/api/documents/${docId}/rating`],
    ['post', `/api/documents/${docId}/like`], ['post', `/api/documents/${docId}/tags`], ['post', '/api/comments/1/flag']]) {
    assert.equal((await anon[m](p).send({})).status, 401, p);
  }
});

test('comment HTML is stored as plain text; detail shows visible comments with author name', async () => {
  const res = await a.post(`/api/documents/${docId}/comments`).send({ body: '<b>hi</b><script>alert(1)</script> there' });
  assert.equal(res.status, 201);
  const { rows } = await query('SELECT body, status FROM comments WHERE id = $1', [res.body.id]);
  assert.ok(!/[<>]/.test(rows[0].body));
  assert.match(rows[0].body, /hi/);
  assert.equal(rows[0].status, 'visible');
  const d = await request(app).get('/api/documents/doc');
  assert.equal(d.body.comments.length, 1);
  assert.equal(d.body.comments[0].author, 'Linh Tran');
  assert.equal((await a.post(`/api/documents/${docId}/comments`).send({ body: '   ' })).status, 400);
  assert.equal((await a.post(`/api/documents/${docId}/comments`).send({ body: 'x'.repeat(2001) })).status, 400);
  assert.equal((await a.post(`/api/documents/${draftId}/comments`).send({ body: 'hi' })).status, 404);
});

test('moderation setting makes comments pending and hidden from detail', async () => {
  await query("UPDATE settings SET value = 'on' WHERE key = 'comment_moderation'");
  try {
    const res = await a.post(`/api/documents/${docId}/comments`).send({ body: 'needs review' });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'pending');
    const d = await request(app).get('/api/documents/doc');
    assert.ok(!d.body.comments.some((c) => c.body === 'needs review'));
  } finally {
    await query("UPDATE settings SET value = 'off' WHERE key = 'comment_moderation'");
  }
});

test('rating upserts to one per user and averages', async () => {
  assert.equal((await a.post(`/api/documents/${docId}/rating`).send({ value: 3 })).status, 200);
  const r2 = await a.post(`/api/documents/${docId}/rating`).send({ value: 5 });
  assert.equal(r2.status, 200);
  assert.equal((await query('SELECT * FROM ratings WHERE document_id = $1', [docId])).rows.length, 1);
  await b.post(`/api/documents/${docId}/rating`).send({ value: 4 });
  const d = await a.get('/api/documents/doc');
  assert.equal(d.body.rating, 4.5);
  assert.equal(d.body.rating_count, 2);
  assert.equal(d.body.my_rating, 5);
  for (const v of [0, 6, 2.5, 'x', null]) assert.equal((await a.post(`/api/documents/${docId}/rating`).send({ value: v })).status, 400);
  assert.equal((await a.delete(`/api/documents/${docId}/rating`)).status, 200);
  assert.equal((await query('SELECT * FROM ratings WHERE document_id = $1', [docId])).rows.length, 1);
});

test('like toggles', async () => {
  const l1 = await a.post(`/api/documents/${docId}/like`);
  assert.deepEqual([l1.body.liked, l1.body.count], [true, 1]);
  assert.equal((await a.get('/api/documents/doc')).body.liked, true);
  const l2 = await a.post(`/api/documents/${docId}/like`);
  assert.deepEqual([l2.body.liked, l2.body.count], [false, 0]);
  await a.post(`/api/documents/${docId}/like`);
  const del = await a.delete(`/api/documents/${docId}/like`);
  assert.equal(del.body.liked, false);
  assert.equal((await a.delete(`/api/documents/${docId}/like`)).status, 200);
});

test('tags: normalised, validated, creates when new, only the adder removes', async () => {
  const res = await a.post(`/api/documents/${docId}/tags`).send({ name: '  Wi-Fi 6  ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'wi-fi 6');
  const row = (await query('SELECT dt.added_by, t.name FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = $1', [docId])).rows[0];
  assert.equal(row.name, 'wi-fi 6');
  assert.ok(row.added_by);
  // same tag again does not duplicate the tag
  await b.post(`/api/documents/${docId}/tags`).send({ name: 'wi-fi 6' });
  assert.equal((await query("SELECT * FROM tags WHERE name = 'wi-fi 6'")).rows.length, 1);
  for (const name of ['x', 'y'.repeat(31), '<b>bold</b>', '', 5, '!!']) {
    assert.equal((await a.post(`/api/documents/${docId}/tags`).send({ name })).status, 400, String(name));
  }
  assert.equal((await b.delete(`/api/documents/${docId}/tags/${res.body.id}`)).status, 403);
  assert.equal((await a.delete(`/api/documents/${docId}/tags/${res.body.id}`)).status, 200);
  assert.equal((await query('SELECT * FROM document_tags WHERE document_id = $1', [docId])).rows.length, 0);
  assert.equal((await a.delete(`/api/documents/${docId}/tags/${res.body.id}`)).status, 404);
});

test('a user may flag a comment once', async () => {
  const c = (await query("SELECT id FROM comments WHERE document_id = $1 AND status = 'visible' LIMIT 1", [docId])).rows[0];
  const f1 = await b.post(`/api/comments/${c.id}/flag`).send({ reason: 'spam <i>link</i>' });
  assert.equal(f1.status, 201);
  const f2 = await b.post(`/api/comments/${c.id}/flag`).send({ reason: 'again' });
  assert.equal(f2.status, 409);
  assert.equal((await query('SELECT * FROM flags WHERE comment_id = $1', [c.id])).rows.length, 1);
  assert.ok(!/[<>]/.test((await query('SELECT reason FROM flags WHERE comment_id = $1', [c.id])).rows[0].reason));
  assert.equal((await b.post('/api/comments/999999/flag').send({ reason: 'x' })).status, 404);
  assert.equal((await b.post(`/api/comments/${c.id}/flag`).send({ reason: '' })).status, 400);
});
