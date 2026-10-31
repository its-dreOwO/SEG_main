import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import app from '../src/app.js';
import { pool, query } from '../src/db.js';
import { requireAuth, requirePermission } from '../src/auth.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { resetDb, loginAs, TEST_PASSWORD, ROLE_EMAILS } from './helpers.js';

before(resetDb);
after(() => pool.end());

const newUser = (over = {}) => ({
  email: 'new.user@shop.test',
  password: 'a-good-password',
  display_name: 'New User',
  ...over,
});

test('register then login works, no hash in responses, login is logged', async () => {
  const reg = await request(app).post('/api/auth/register').send(newUser());
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, 'new.user@shop.test');
  assert.equal(reg.body.user.role, 'customer');
  assert.ok(!JSON.stringify(reg.body).includes('password'));

  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: 'New.User@shop.test', password: 'a-good-password' });
  assert.equal(login.status, 200);
  assert.ok(!JSON.stringify(login.body).includes('hash'));
  const cookie = login.headers['set-cookie'].find((c) => c.startsWith('sid='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.doesNotMatch(cookie, /Secure/i); // test env is plain http
  assert.match(cookie, /Max-Age=604800/i);

  const me = await agent.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'new.user@shop.test');
  assert.ok(!('password_hash' in me.body));

  const { rows } = await query("SELECT * FROM system_logs WHERE action = 'login' AND user_id = $1", [me.body.id]);
  assert.equal(rows.length, 1);
});

test('wrong password gives 401 and unknown email gives the same 401', async () => {
  const a = await request(app).post('/api/auth/login').send({ email: ROLE_EMAILS.customer, password: 'wrong-password' });
  const b = await request(app).post('/api/auth/login').send({ email: 'nobody@shop.test', password: 'wrong-password' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
  assert.ok(a.body.error);
});

test('duplicate email gives 409', async () => {
  const res = await request(app).post('/api/auth/register').send(newUser({ email: ROLE_EMAILS.customer.toUpperCase() }));
  assert.equal(res.status, 409);
  assert.ok(res.body.error);
});

test('password under 8 characters gives 400; bad email gives 400', async () => {
  const short = await request(app).post('/api/auth/register').send(newUser({ email: 'short@shop.test', password: '1234567' }));
  assert.equal(short.status, 400);
  assert.ok(short.body.error);
  const bad = await request(app).post('/api/auth/register').send(newUser({ email: 'not-an-email' }));
  assert.equal(bad.status, 400);
});

test('profile update persists and strips HTML', async () => {
  const agent = await loginAs('customer');
  const res = await agent.patch('/api/me').send({
    display_name: '<b>Linh</b> T<script>alert(1)</script>',
    bio: 'Hello <img src=x onerror=alert(1)> world',
  });
  assert.equal(res.status, 200);
  const me = await agent.get('/api/me');
  assert.doesNotMatch(me.body.display_name, /[<>]/);
  assert.doesNotMatch(me.body.bio, /[<>]/);
  assert.match(me.body.display_name, /^Linh T/);
  assert.match(me.body.bio, /^Hello\s+world$/);
  const { rows } = await query('SELECT display_name, bio FROM users WHERE email = $1', [ROLE_EMAILS.customer]);
  assert.equal(rows[0].display_name, me.body.display_name);
  assert.equal(rows[0].bio, me.body.bio);
});

test('unauthenticated /api/me gives 401; logout clears the cookie', async () => {
  const anon = await request(app).get('/api/me');
  assert.equal(anon.status, 401);
  assert.deepEqual(Object.keys(anon.body), ['error']);

  const agent = await loginAs('moderator');
  const out = await agent.post('/api/auth/logout');
  assert.equal(out.status, 200);
  const after = await agent.get('/api/me');
  assert.equal(after.status, 401);
});

test('a deactivated user existing cookie gets 401 at once, and cannot log in', async () => {
  const agent = await loginAs('seo_specialist');
  assert.equal((await agent.get('/api/me')).status, 200);
  await query('UPDATE users SET active = false WHERE email = $1', [ROLE_EMAILS.seo_specialist]);
  assert.equal((await agent.get('/api/me')).status, 401);
  const login = await request(app).post('/api/auth/login').send({ email: ROLE_EMAILS.seo_specialist, password: TEST_PASSWORD });
  assert.equal(login.status, 401);
  await query('UPDATE users SET active = true WHERE email = $1', [ROLE_EMAILS.seo_specialist]);
});

test('requirePermission: customer gets 403, permitted role passes, edits apply at once', async () => {
  const mini = express();
  mini.use(cookieParser());
  mini.get('/needs-users', requireAuth, requirePermission('users.manage'), (req, res) => res.json({ user: req.user }));

  const cookieFor = async (role) => {
    const res = await request(app).post('/api/auth/login').send({ email: ROLE_EMAILS[role], password: TEST_PASSWORD });
    return res.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0];
  };
  const customer = await cookieFor('customer');
  const admin = await cookieFor('super_admin');

  assert.equal((await request(mini).get('/needs-users')).status, 401);
  const denied = await request(mini).get('/needs-users').set('Cookie', customer);
  assert.equal(denied.status, 403);
  assert.deepEqual(Object.keys(denied.body), ['error']);

  const ok = await request(mini).get('/needs-users').set('Cookie', admin);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'super_admin');
  assert.ok(ok.body.user.permissions.includes('users.manage'));

  // Permission edits take effect on the next request, with no re-login.
  await query(`DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE name = 'super_admin')
               AND permission_id = (SELECT id FROM permissions WHERE code = 'users.manage')`);
  assert.equal((await request(mini).get('/needs-users').set('Cookie', admin)).status, 403);
  await resetDb();
});

test('a tampered or wrongly signed token gets 401', async () => {
  const res = await request(app).get('/api/me').set('Cookie', 'sid=not.a.jwt');
  assert.equal(res.status, 401);
});

test('login is rate limited after repeated failures; successes do not count', async () => {
  const mini = express();
  mini.set('trust proxy', 1);
  mini.use(express.json());
  mini.use(cookieParser());
  mini.use('/api', createAuthRouter({ loginMax: 3 }));
  const bad = () => request(mini).post('/api/auth/login').send({ email: ROLE_EMAILS.customer, password: 'wrong-password' });
  for (let i = 0; i < 3; i++) {
    const ok = await request(mini).post('/api/auth/login').send({ email: ROLE_EMAILS.customer, password: TEST_PASSWORD });
    assert.equal(ok.status, 200);
  }
  for (let i = 0; i < 3; i++) assert.equal((await bad()).status, 401);
  const limited = await bad();
  assert.equal(limited.status, 429);
  assert.ok(limited.body.error);
});
