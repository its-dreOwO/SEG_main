import fs from 'node:fs';
import pg from 'pg';

const url =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const config = { connectionString: url };
if (process.env.PGSSLROOTCERT) {
  // pg parses sslmode from the URL and would override the ssl option below, so drop it.
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  config.connectionString = u.toString();
  config.ssl = { ca: fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true };
}

export const pool = new pg.Pool(config);

export function query(text, params) {
  return pool.query(text, params);
}
