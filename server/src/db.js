import fs from 'node:fs';
import pg from 'pg';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';
const urlVar = isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
const url = process.env[urlVar];

if (!url) throw new Error(`${urlVar} is not set; cannot connect to the database`);
if (isProd && !process.env.PGSSLROOTCERT) {
  throw new Error('PGSSLROOTCERT must be set in production so the database TLS certificate is verified');
}

const config = { connectionString: url };
if (process.env.PGSSLROOTCERT) {
  // pg parses sslmode from the URL and would override the ssl option below, so drop it.
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  config.connectionString = u.toString();
  config.ssl = { ca: fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true };
}

export const pool = new pg.Pool(config);

// An idle client erroring (e.g. the server restarting) must be logged, not crash the process.
pool.on('error', (err) => console.error('postgres pool error:', err.message));

export function query(text, params) {
  return pool.query(text, params);
}
