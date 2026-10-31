import express from 'express';
import { query, pool } from '../../db.js';
import { requirePermission, wrap } from '../../auth.js';
import { logAction } from '../../log.js';
import { bad, notFound, toId, paginate } from './util.js';

export function createUsersAdminRouter() {
  const router = express.Router();

  router.get('/users', requirePermission('users.manage'), wrap(async (req, res) => {
    const out = await paginate(req, res, {
      from: 'FROM users u JOIN roles r ON r.id = u.role_id',
      select: 'u.id, u.email, u.display_name, r.name AS role, u.active, u.created_at',
      order: 'u.id',
    });
    if (out) res.json(out);
  }));

  router.patch('/users/:id/role', requirePermission('users.manage'), wrap(async (req, res) => {
    const id = toId(req.params.id);
    const role = req.body?.role;
    if (id === null || typeof role !== 'string') return bad(res, 'role is required');
    const r = (await query('SELECT id FROM roles WHERE name = $1', [role])).rows[0];
    if (!r) return bad(res, 'Unknown role');
    const u = await query('UPDATE users SET role_id = $1 WHERE id = $2 RETURNING id', [r.id, id]);
    if (!u.rows.length) return notFound(res);
    await logAction(req.user.id, 'user.role_change', `user ${id} -> ${role}`);
    res.json({ ok: true });
  }));

  router.patch('/users/:id/active', requirePermission('users.manage'), wrap(async (req, res) => {
    const id = toId(req.params.id);
    const active = req.body?.active;
    if (id === null || typeof active !== 'boolean') return bad(res, 'active must be true or false');
    if (id === req.user.id && !active) return bad(res, 'You cannot deactivate yourself');
    const u = await query('UPDATE users SET active = $1 WHERE id = $2 RETURNING id', [active, id]);
    if (!u.rows.length) return notFound(res);
    await logAction(req.user.id, active ? 'user.activate' : 'user.deactivate', `user ${id}`);
    res.json({ ok: true });
  }));

  router.get('/roles', requirePermission('roles.manage'), wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT r.id, r.name, r.description,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        GROUP BY r.id ORDER BY r.id`,
    );
    res.json(rows);
  }));

  router.put('/roles/:id/permissions', requirePermission('roles.manage'), wrap(async (req, res) => {
    const id = toId(req.params.id);
    const codes = req.body?.permissions;
    if (id === null || !Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) return bad(res, 'permissions must be an array of codes');
    const role = (await query('SELECT id FROM roles WHERE id = $1', [id])).rows[0];
    if (!role) return notFound(res);
    const perms = (await query('SELECT id FROM permissions WHERE code = ANY($1)', [codes])).rows;
    if (perms.length !== new Set(codes).size) return bad(res, 'Unknown permission code');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      for (const p of perms) await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [id, p.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await logAction(req.user.id, 'role.permissions', `role ${id}: ${codes.join(',')}`);
    res.json({ ok: true });
  }));

  router.get('/logs', requirePermission('logs.view'), wrap(async (req, res) => {
    const out = await paginate(req, res, {
      from: 'FROM system_logs l LEFT JOIN users u ON u.id = l.user_id',
      select: 'l.id, l.user_id, u.email AS user_email, l.action, l.detail, l.created_at',
      order: 'l.id DESC',
    });
    if (out) res.json(out);
  }));

  router.get('/settings', requirePermission('settings.manage'), wrap(async (_req, res) => {
    const { rows } = await query('SELECT key, value FROM settings');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }));

  router.put('/settings', requirePermission('settings.manage'), wrap(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) return bad(res, 'Expected an object of settings');
    const known = new Set((await query('SELECT key FROM settings')).rows.map((r) => r.key));
    for (const [k, v] of Object.entries(body)) {
      if (!known.has(k)) return bad(res, `Unknown setting ${k}`);
      if (typeof v !== 'string' || v.length > 500) return bad(res, `Invalid value for ${k}`);
    }
    for (const [k, v] of Object.entries(body)) await query('UPDATE settings SET value = $1 WHERE key = $2', [v, k]);
    await logAction(req.user.id, 'settings.update', Object.keys(body).join(','));
    res.json({ ok: true });
  }));

  return router;
}
