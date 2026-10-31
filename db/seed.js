// Repeatable: applies db/schema.sql (drops and recreates tables), then seeds base data.
// Usage from repo root: SEED_PASSWORD=... node db/seed.js   (DATABASE_URL, or TEST_DATABASE_URL with NODE_ENV=test)
// products.js / articles.js in db/data are loaded by a later task when present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../server/src/db.js';
import { hashPassword } from '../server/src/password.js';
import { roles, permissions, rolePermissions, users, categories, settings } from './data/users.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function applySchema() {
  await query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
}

export async function seedBase(password) {
  if (!password) throw new Error('SEED_PASSWORD is required');
  for (const [name, description] of roles) {
    await query('INSERT INTO roles (name, description) VALUES ($1, $2)', [name, description]);
  }
  for (const code of permissions) {
    await query('INSERT INTO permissions (code) VALUES ($1)', [code]);
  }
  for (const [role, codes] of Object.entries(rolePermissions)) {
    for (const code of codes) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = $1 AND p.code = $2`,
        [role, code],
      );
    }
  }
  const hash = await hashPassword(password);
  for (const u of users) {
    await query(
      `INSERT INTO users (email, password_hash, display_name, role_id)
       SELECT $1, $2, $3, id FROM roles WHERE name = $4`,
      [u.email, hash, u.name, u.role],
    );
  }
  for (const [slug, name, nameVi] of categories) {
    await query('INSERT INTO categories (slug, name, name_vi) VALUES ($1, $2, $3)', [slug, name, nameVi]);
  }
  for (const [key, value] of Object.entries(settings)) {
    await query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
  }
}

export async function seedAll(password) {
  await applySchema();
  await seedBase(password);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await seedAll(process.env.SEED_PASSWORD);
    console.log('seeded');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
