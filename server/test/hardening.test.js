import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../src/db.js';
import { seedAll } from '../../db/seed.js';
import { resetDb, assertTestDatabaseUrl } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

before(resetDb);
after(() => pool.end());

const runSeed = (args, env = {}) =>
  spawnSync('node', ['db/seed.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', ...env },
  });

test('seed CLI without --reset refuses and leaves data intact', async () => {
  await query("INSERT INTO settings (key, value) VALUES ('marker', 'x')");
  const r = runSeed([], { SEED_PASSWORD: 'some-password-1' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--reset/);
  const { rows } = await query("SELECT 1 FROM settings WHERE key = 'marker'");
  assert.equal(rows.length, 1);
});

test('seed CLI with --reset but no SEED_PASSWORD fails before dropping anything', async () => {
  const env = { SEED_PASSWORD: '' };
  const r = runSeed(['--reset'], env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SEED_PASSWORD/);
  const { rows } = await query("SELECT 1 FROM settings WHERE key = 'marker'");
  assert.equal(rows.length, 1);
});

test('seedAll validates the password and requires reset before dropping', async () => {
  await assert.rejects(() => seedAll('', { reset: true }), /SEED_PASSWORD/);
  await assert.rejects(() => seedAll('pw-long-enough'), /reset/i);
  const { rows } = await query("SELECT 1 FROM settings WHERE key = 'marker'");
  assert.equal(rows.length, 1);
});

test('test database guard is an exact match on name and host', () => {
  const ok = (u) => assert.doesNotThrow(() => assertTestDatabaseUrl(u, 'test'), u);
  const bad = (u) => assert.throws(() => assertTestDatabaseUrl(u, 'test'), /refused/, u);
  ok('postgres://postgres:p@127.0.0.1:55432/shop_test');
  ok('postgres://postgres:p@localhost:5432/shop_test');
  bad('postgres://postgres:p@127.0.0.1:55432/shop_test_prod');
  bad('postgres://postgres:p@127.0.0.1:55432/myshop_test');
  bad('postgres://postgres:p@127.0.0.1:55432/shop');
  bad('postgres://postgres:p@db.example.com:5432/shop_test');
  bad('postgres://postgres:p@127.0.0.1.evil.com:5432/shop_test');
  assert.throws(() => assertTestDatabaseUrl('postgres://postgres:p@127.0.0.1/shop_test', 'production'), /refused/);
});

test('schema has the new foreign key indexes', async () => {
  const { rows } = await query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'");
  const defs = rows.map((r) => r.indexdef).join('\n');
  for (const [t, c] of [['document_tags', 'tag_id'], ['comments', 'parent_id'], ['order_items', 'order_id'], ['flags', 'comment_id']]) {
    assert.match(defs, new RegExp(`ON public\\.${t} USING btree \\(${c}\\)`), `${t}(${c})`);
  }
});
