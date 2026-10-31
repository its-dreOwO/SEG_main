import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetDb, loginAs } from './helpers.js';

let a;
let b;
let anon;
let d1;
let d2;
const stock = async (id) => (await query('SELECT stock FROM documents WHERE id = $1', [id])).rows[0].stock;

before(async () => {
  await resetDb();
  d1 = (await query("INSERT INTO documents (title, slug, status, price, stock) VALUES ('P1', 'p1', 'published', 10.50, 5) RETURNING id")).rows[0].id;
  d2 = (await query("INSERT INTO documents (title, slug, status, price, stock) VALUES ('P2', 'p2', 'published', 20, 1) RETURNING id")).rows[0].id;
  a = await loginAs('customer');
  b = await loginAs('moderator');
  anon = request(app);
});
after(() => pool.end());

const body = (items, token) => ({ items, address: '1 Main St', clientToken: token });

test('login is required to order', async () => {
  assert.equal((await anon.post('/api/orders').send(body([{ docId: d1, qty: 1 }], 't0'))).status, 401);
});

test('total is computed from DB prices and client prices are ignored; stock decremented', async () => {
  const res = await a.post('/api/orders').send(body([{ docId: d1, qty: 2, price: 0.01 }], 't1'));
  assert.equal(res.status, 201);
  assert.equal(Number(res.body.total), 21);
  assert.equal(await stock(d1), 3);
  const items = (await query('SELECT unit_price::float AS p, quantity FROM order_items WHERE order_id = $1', [res.body.id])).rows;
  assert.deepEqual(items, [{ p: 10.5, quantity: 2 }]);
});

test('qty over stock is 409 with no partial change; qty under 1 is 400', async () => {
  const res = await a.post('/api/orders').send(body([{ docId: d1, qty: 1 }, { docId: d2, qty: 2 }], 't2'));
  assert.equal(res.status, 409);
  assert.equal(await stock(d1), 3);
  assert.equal(await stock(d2), 1);
  assert.equal((await query("SELECT count(*)::int AS n FROM orders WHERE client_token = 't2'")).rows[0].n, 0);
  assert.equal((await a.post('/api/orders').send(body([{ docId: d1, qty: 0 }], 't3'))).status, 400);
  assert.equal((await a.post('/api/orders').send(body([{ docId: d1, qty: -1 }], 't3'))).status, 400);
});

test('same clientToken twice creates one order', async () => {
  const r1 = await a.post('/api/orders').send(body([{ docId: d1, qty: 1 }], 't4'));
  const r2 = await a.post('/api/orders').send(body([{ docId: d1, qty: 1 }], 't4'));
  assert.equal(r1.status, 201);
  assert.ok(r2.status === 200 || r2.status === 201);
  assert.equal(r1.body.id, r2.body.id);
  assert.equal(await stock(d1), 2);
});

test('a user cannot read another user order; list returns own newest first', async () => {
  const mine = await a.get('/api/orders');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.length >= 2);
  assert.ok(mine.body[0].id > mine.body[1].id);
  assert.ok(Array.isArray(mine.body[0].items));
  const id = mine.body[0].id;
  assert.equal((await a.get(`/api/orders/${id}`)).status, 200);
  assert.equal((await b.get(`/api/orders/${id}`)).status, 404);
  assert.equal((await b.get('/api/orders')).body.length, 0);
});

test('two concurrent orders for the last unit produce exactly one success', async () => {
  const [r1, r2] = await Promise.all([
    a.post('/api/orders').send(body([{ docId: d2, qty: 1 }], 'c1')),
    b.post('/api/orders').send(body([{ docId: d2, qty: 1 }], 'c2')),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
  assert.equal(await stock(d2), 0);
});
