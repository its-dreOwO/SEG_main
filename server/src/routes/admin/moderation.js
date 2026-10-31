import express from 'express';
import { query } from '../../db.js';
import { requirePermission, wrap } from '../../auth.js';
import { logAction } from '../../log.js';
import { bad, notFound, toId, paginate } from './util.js';

const mod = requirePermission('moderation.manage');
const STATUSES = ['visible', 'hidden', 'pending', 'spam'];

export function createModerationAdminRouter() {
  const router = express.Router();

  // Queue of comments awaiting review (pending by default); ?status= selects another status.
  router.get('/comments', mod, wrap(async (req, res) => {
    const status = req.query.status ?? 'pending';
    if (!STATUSES.includes(status)) return bad(res, 'Invalid status');
    const out = await paginate(req, res, {
      from: 'FROM comments c JOIN users u ON u.id = c.user_id JOIN documents d ON d.id = c.document_id WHERE c.status = $1',
      params: [status],
      select: 'c.id, c.document_id, d.title AS document_title, c.user_id, u.display_name AS author, c.body, c.status, c.created_at',
      order: 'c.created_at, c.id',
    });
    if (out) res.json(out);
  }));

  async function setStatus(req, res, status) {
    const id = toId(req.params.id);
    const upd = id === null ? null : await query('UPDATE comments SET status = $1 WHERE id = $2 RETURNING id', [status, id]);
    if (!upd?.rows.length) return notFound(res);
    await logAction(req.user.id, `comment.${status}`, `comment ${id}`);
    res.json({ ok: true });
  }

  router.patch('/comments/:id', mod, wrap(async (req, res) => {
    if (!STATUSES.includes(req.body?.status)) return bad(res, 'Invalid status');
    return setStatus(req, res, req.body.status);
  }));

  router.post('/comments/:id/spam', mod, wrap((req, res) => setStatus(req, res, 'spam')));

  router.get('/flags', mod, wrap(async (req, res) => {
    const out = await paginate(req, res, {
      from: 'FROM flags f JOIN comments c ON c.id = f.comment_id WHERE f.resolved_at IS NULL',
      select: 'f.id, f.comment_id, c.body AS comment_body, c.status AS comment_status, f.reporter_id, f.reason, f.created_at',
      order: 'f.created_at, f.id',
    });
    if (out) res.json(out);
  }));

  router.post('/flags/:id/resolve', mod, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const resolution = req.body?.resolution;
    if (typeof resolution !== 'string' || !resolution.trim() || resolution.length > 500) return bad(res, 'resolution is required');
    const upd = id === null ? null : await query(
      'UPDATE flags SET resolution = $1, resolved_by = $2, resolved_at = now() WHERE id = $3 AND resolved_at IS NULL RETURNING id',
      [resolution.trim(), req.user.id, id]);
    if (!upd?.rows.length) return notFound(res);
    await logAction(req.user.id, 'flag.resolve', `flag ${id}`);
    res.json({ ok: true });
  }));

  return router;
}
