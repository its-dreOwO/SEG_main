import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Import db.js in a clean child process with a controlled environment.
function loadDb(env) {
  const base = { PATH: process.env.PATH };
  return spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./src/db.js'); await m.pool.end();"], {
    cwd: new URL('..', import.meta.url),
    env: { ...base, ...env },
    encoding: 'utf8',
  });
}

test('production without PGSSLROOTCERT refuses to start', () => {
  const r = loadDb({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example:5432/x' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PGSSLROOTCERT/);
});

test('missing database URL gives a clear error', () => {
  const r = loadDb({ NODE_ENV: 'development' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /DATABASE_URL is not set/);
  const t = loadDb({ NODE_ENV: 'test' });
  assert.notEqual(t.status, 0);
  assert.match(t.stderr, /TEST_DATABASE_URL is not set/);
});

test('production without JWT_SECRET refuses to load auth', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/auth.js')"], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db.example:5432/x',
      PGSSLROOTCERT: new URL('../package.json', import.meta.url).pathname, // any readable file; never used to connect
    },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /JWT_SECRET/);
});
