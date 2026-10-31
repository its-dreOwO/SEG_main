import express from 'express';
import { query } from '../db.js';
import { requireAuth, optionalAuth, wrap } from '../auth.js';
import { stripHtml } from './auth.js';

const toId = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);

function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function publishedDoc(id) {
  if (id === null) return null;
  const { rows } = await query("SELECT id FROM documents WHERE id = $1 AND status = 'published'", [id]);
  return rows[0] || null;
}

export function createEngagementRouter() {
  const router = express.Router();

  router.post('/search/click', optionalAuth, wrap(async (req, res) => {
    const { query: text, docId } = req.body ?? {};
    const id = toId(docId);
    if (id === null) return res.status(400).json({ error: 'docId is required' });
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    const qs = typeof text === 'string' ? stripHtml(text).slice(0, 200) : '';
    await query('INSERT INTO search_click_log (user_id, query_string, clicked_doc_id) VALUES ($1, $2, $3)', [
      req.user?.id ?? null, qs, id,
    ]);
    res.json({ ok: true });
  }));

  router.post('/documents/:id/comments', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const { body, parent_id: parentRaw } = req.body ?? {};
    const text = typeof body === 'string' ? stripHtml(body) : '';
    if (!text || text.length > 2000) return res.status(400).json({ error: 'Comment must be 1 to 2000 characters' });
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    let parentId = null;
    if (parentRaw !== undefined && parentRaw !== null) {
      parentId = toId(parentRaw);
      const ok = parentId !== null && (await query('SELECT 1 FROM comments WHERE id = $1 AND document_id = $2', [parentId, id])).rows.length;
      if (!ok) return res.status(400).json({ error: 'Invalid parent comment' });
    }
    const mod = (await query("SELECT value FROM settings WHERE key = 'comment_moderation'")).rows[0];
    const status = mod?.value === 'on' ? 'pending' : 'visible';
    const { rows } = await query(
      `INSERT INTO comments (document_id, user_id, parent_id, body, status) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parent_id, body, status, created_at`,
      [id, req.user.id, parentId, text, status],
    );
    res.status(201).json(rows[0]);
  }));

  async function ratingSummary(id) {
    const { rows } = await query(
      'SELECT round(avg(value), 1)::float AS rating, count(*)::int AS rating_count FROM ratings WHERE document_id = $1', [id]);
    return rows[0];
  }

  router.post('/documents/:id/rating', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const value = req.body?.value;
    if (!Number.isInteger(value) || value < 1 || value > 5) return res.status(400).json({ error: 'Rating must be an integer 1 to 5' });
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    await query(
      `INSERT INTO ratings (user_id, document_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, document_id) DO UPDATE SET value = EXCLUDED.value`,
      [req.user.id, id, value],
    );
    res.json({ my_rating: value, ...(await ratingSummary(id)) });
  }));

  router.delete('/documents/:id/rating', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    await query('DELETE FROM ratings WHERE user_id = $1 AND document_id = $2', [req.user.id, id]);
    res.json({ my_rating: null, ...(await ratingSummary(id)) });
  }));

  async function likeState(id, userId) {
    const { rows } = await query(
      `SELECT count(*)::int AS count, coalesce(bool_or(user_id = $2), false) AS liked FROM likes WHERE document_id = $1`,
      [id, userId]);
    return rows[0];
  }

  router.post('/documents/:id/like', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    const del = await query('DELETE FROM likes WHERE user_id = $1 AND document_id = $2', [req.user.id, id]);
    if (!del.rowCount) {
      await query('INSERT INTO likes (user_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, id]);
    }
    res.json(await likeState(id, req.user.id));
  }));

  router.delete('/documents/:id/like', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });
    await query('DELETE FROM likes WHERE user_id = $1 AND document_id = $2', [req.user.id, id]);
    res.json(await likeState(id, req.user.id));
  }));

  router.post('/documents/:id/tags', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const raw = req.body?.name;
    if (typeof raw !== 'string') return res.status(400).json({ error: 'Tag name is required' });
    const name = raw.trim().toLowerCase();
    if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Tag must be 2 to 30 characters' });
    if (/[<>]/.test(name) || stripHtml(name) !== name) return res.status(400).json({ error: 'Tag must be plain text' });
    const slug = slugify(name);
    if (!slug) return res.status(400).json({ error: 'Tag must contain letters or digits' });
    if (!(await publishedDoc(id))) return res.status(404).json({ error: 'Not found' });

    let tag = (await query('SELECT id, name, slug FROM tags WHERE name = $1', [name])).rows[0];
    if (!tag) {
      const ins = await query(
        'INSERT INTO tags (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id, name, slug', [name, slug]);
      tag = ins.rows[0] || (await query('SELECT id, name, slug FROM tags WHERE name = $1', [name])).rows[0];
      if (!tag) return res.status(409).json({ error: 'A similar tag already exists' });
    }
    const link = await query(
      'INSERT INTO document_tags (document_id, tag_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, tag.id, req.user.id]);
    res.status(link.rowCount ? 201 : 200).json(tag);
  }));

  router.delete('/documents/:id/tags/:tagId', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const tagId = toId(req.params.tagId);
    if (id === null || tagId === null) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query('SELECT added_by FROM document_tags WHERE document_id = $1 AND tag_id = $2', [id, tagId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].added_by !== req.user.id) return res.status(403).json({ error: 'Only the user who added a tag can remove it' });
    await query('DELETE FROM document_tags WHERE document_id = $1 AND tag_id = $2', [id, tagId]);
    res.json({ ok: true });
  }));

  router.post('/comments/:id/flag', requireAuth, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const reason = typeof req.body?.reason === 'string' ? stripHtml(req.body.reason) : '';
    if (!reason || reason.length > 500) return res.status(400).json({ error: 'Reason must be 1 to 500 characters' });
    const c = id === null ? null : (await query(
      `SELECT c.id FROM comments c JOIN documents d ON d.id = c.document_id
        WHERE c.id = $1 AND c.status = 'visible' AND d.status = 'published'`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    // One flag per user per comment; a unique index on (comment_id, reporter_id) enforces it under concurrency.
    const { rowCount } = await query(
      `INSERT INTO flags (comment_id, reporter_id, reason)
       VALUES ($1, $2, $3) ON CONFLICT (comment_id, reporter_id) DO NOTHING`,
      [id, req.user.id, reason]);
    if (!rowCount) return res.status(409).json({ error: 'You have already flagged this comment' });
    res.status(201).json({ ok: true });
  }));

  return router;
}
