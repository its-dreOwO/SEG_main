import request from 'supertest';
import app from '../src/app.js';
import { query } from '../src/db.js';
import { seedAll } from '../../db/seed.js';

// Fixed password for the throwaway test database only.
export const TEST_PASSWORD = 'test-password-1';

export const ROLE_EMAILS = {
  super_admin: 'admin@shop.test',
  content_manager: 'content@shop.test',
  moderator: 'moderator@shop.test',
  seo_specialist: 'seo@shop.test',
  customer: 'linh@shop.test',
};

function assertTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !url) {
    throw new Error('resetDb refused: NODE_ENV must be test and TEST_DATABASE_URL set');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) throw new Error(`resetDb refused: ${dbName} is not a test database`);
  return dbName;
}

export async function resetDb() {
  const dbName = assertTestDatabase();
  const { rows } = await query('SELECT current_database() AS db');
  if (rows[0].db !== dbName) throw new Error('resetDb refused: connected database is not the test database');
  await seedAll(TEST_PASSWORD);
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
