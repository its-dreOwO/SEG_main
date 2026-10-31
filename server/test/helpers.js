import request from 'supertest';
import app from '../src/app.js';
import { query } from '../src/db.js';
import { applySchema, seedBase } from '../../db/seed.js';

// Fixed password for the throwaway test database only.
export const TEST_PASSWORD = 'test-password-1';

export const ROLE_EMAILS = {
  super_admin: 'admin@shop.test',
  content_manager: 'content@shop.test',
  moderator: 'moderator@shop.test',
  seo_specialist: 'seo@shop.test',
  customer: 'linh@shop.test',
};

// Exact match: database name must be shop_test and host 127.0.0.1 or localhost (no substring tricks).
export function assertTestDatabaseUrl(url, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== 'test' || !url) {
    throw new Error('resetDb refused: NODE_ENV must be test and TEST_DATABASE_URL set');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('resetDb refused: TEST_DATABASE_URL is not a valid URL');
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (dbName !== 'shop_test') throw new Error(`resetDb refused: database ${dbName} is not shop_test`);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`resetDb refused: host ${parsed.hostname} is not local`);
  }
  return dbName;
}

export async function resetDb() {
  const dbName = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const { rows } = await query('SELECT current_database() AS db');
  if (rows[0].db !== dbName) throw new Error('resetDb refused: connected database is not the test database');
  // Base data only (roles, permissions, users, categories, settings). The full catalogue is
  // loaded by tests that need it, via seedContent() from db/seed.js.
  await applySchema();
  await seedBase(TEST_PASSWORD);
}

// Returns a supertest agent holding the login cookie (needs POST /api/auth/login, added with auth).
export async function loginAs(role) {
  const email = ROLE_EMAILS[role];
  if (!email) throw new Error(`unknown role ${role}`);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`loginAs(${role}) failed: ${res.status}`);
  return agent;
}
