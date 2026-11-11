-- Adds the store_manager role, the db.view permission (granted to super_admin and
-- store_manager) and the demo account manager@shop.test for an existing database.
-- Additive and idempotent: only INSERTs with ON CONFLICT DO NOTHING, safe to run twice.
-- No reseed needed. Run: psql "$DATABASE_URL" -f db/migrations/2026-11-11-store-manager.sql
BEGIN;

-- 1. Role
INSERT INTO roles (name, description)
VALUES ('store_manager', 'Read-only access to the database dashboard (products, stock, comments, search log)')
ON CONFLICT (name) DO NOTHING;

-- 2. Permission
INSERT INTO permissions (code, description)
VALUES ('db.view', 'View the read-only database dashboard')
ON CONFLICT (code) DO NOTHING;

-- 3. Grants
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('super_admin', 'store_manager') AND p.code = 'db.view'
ON CONFLICT DO NOTHING;

-- 4. Demo account. The password hash is copied from admin@shop.test, so the demo
--    password itself is never stored in the repository.
INSERT INTO users (email, password_hash, display_name, role_id)
SELECT 'manager@shop.test', a.password_hash, 'Robin Manager', r.id
FROM users a, roles r
WHERE a.email = 'admin@shop.test' AND r.name = 'store_manager'
ON CONFLICT (email) DO NOTHING;

COMMIT;
