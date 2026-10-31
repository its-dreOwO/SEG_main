import express from 'express';
import sanitizeHtml from 'sanitize-html';
import { query, pool } from '../../db.js';
import { requirePermission, wrap } from '../../auth.js';
import { logAction } from '../../log.js';
import { slugify } from '../engagement.js';
import { bad, notFound, toId, paginate } from './util.js';

const content = requirePermission('content.manage');
const taxonomy = requirePermission('taxonomy.manage');

const clean = (html) => sanitizeHtml(html);
const TEXT = ['title', 'title_vi', 'summary', 'summary_vi', 'brand', 'image_url', 'author'];
const NUM = ['price', 'compare_at_price'];

const DOC_COLS = `id, kind, title, title_vi, slug, content, content_vi, summary, summary_vi, category_id, author,
  price::float AS price, compare_at_price::float AS compare_at_price, stock, brand, image_url, status,
  seo_title, seo_description, seo_keywords, image_alt, views_count, created_at, updated_at`;

async function tagsOf(id) {
  return (await query('SELECT t.name FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = $1 ORDER BY t.name', [id])).rows.map((r) => r.name);
}

// Validates a document body. Returns {fields} (column -> value) or {error}.
function parseDoc(b, { partial }) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Expected a JSON object' };
  const f = {};
  for (const k of TEXT) {
    if (b[k] === undefined) continue;
    if (b[k] !== null && typeof b[k] !== 'string') return { error: `Invalid ${k}` };
    f[k] = b[k];
  }
  for (const k of ['content', 'content_vi']) {
    if (b[k] === undefined) continue;
    if (b[k] !== null && typeof b[k] !== 'string') return { error: `Invalid ${k}` };
    f[k] = b[k] === null ? null : clean(b[k]);
  }
  if (!partial || f.title !== undefined) {
    if (typeof f.title !== 'string' || !f.title.trim() || f.title.length > 300) return { error: 'title is required' };
  }
  for (const k of NUM) {
    if (b[k] === undefined) continue;
    if (b[k] !== null && (!Number.isFinite(Number(b[k])) || Number(b[k]) < 0 || Number(b[k]) > 99999999)) return { error: `Invalid ${k}` };
    f[k] = b[k] === null ? null : Number(b[k]);
  }
  if (b.stock !== undefined) {
    if (!Number.isInteger(b.stock) || b.stock < 0) return { error: 'Invalid stock' };
    f.stock = b.stock;
  }
  if (b.kind !== undefined) {
    if (!['product', 'article'].includes(b.kind)) return { error: 'Invalid kind' };
    f.kind = b.kind;
  }
  if (b.status !== undefined) {
    if (!['draft', 'published'].includes(b.status)) return { error: 'Invalid status' };
    f.status = b.status;
  }
  if (b.category_id !== undefined) {
    if (b.category_id !== null && !Number.isInteger(b.category_id)) return { error: 'Invalid category_id' };
    f.category_id = b.category_id;
  }
  if (b.slug !== undefined) {
    const s = typeof b.slug === 'string' ? slugify(b.slug.toLowerCase()) : '';
    if (!s) return { error: 'Invalid slug' };
    f.slug = s;
  }
  let tags;
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== 'string' || !slugify(t.toLowerCase()) || t.length > 50)) return { error: 'tags must be an array of names' };
    tags = [...new Set(b.tags.map((t) => t.trim()))];
  }
  return { fields: f, tags };
}

async function setTags(client, docId, names, userId) {
  await client.query('DELETE FROM document_tags WHERE document_id = $1', [docId]);
  for (const name of names) {
    const slug = slugify(name.toLowerCase());
    let tag = (await client.query('SELECT id FROM tags WHERE name = $1', [name])).rows[0];
    if (!tag) {
      tag = (await client.query('INSERT INTO tags (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [name, slug])).rows[0]
        || (await client.query('SELECT id FROM tags WHERE slug = $1', [slug])).rows[0];
    }
    await client.query('INSERT INTO document_tags (document_id, tag_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [docId, tag.id, userId]);
  }
}

const isUnique = (e) => e.code === '23505';

export function createContentAdminRouter() {
  const router = express.Router();

  router.get('/documents', content, wrap(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status) {
      if (!['draft', 'published'].includes(req.query.status)) return bad(res, 'Invalid status');
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    const out = await paginate(req, res, {
      from: `FROM documents ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params,
      select: 'id, kind, title, slug, price::float AS price, stock, status, category_id, created_at, updated_at',
      order: 'id DESC',
    });
    if (out) res.json(out);
  }));

  router.get('/documents/:id', content, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const doc = id === null ? null : (await query(`SELECT ${DOC_COLS} FROM documents WHERE id = $1`, [id])).rows[0];
    if (!doc) return notFound(res);
    res.json({ ...doc, tags: await tagsOf(id) });
  }));

  router.post('/documents', content, wrap(async (req, res) => {
    const { fields, tags, error } = parseDoc(req.body, { partial: false });
    if (error) return bad(res, error);
    if (!fields.slug) fields.slug = slugify(fields.title.toLowerCase()) || 'item';
    const cols = Object.keys(fields);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = (await client.query(
        `INSERT INTO documents (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        cols.map((c) => fields[c]))).rows[0].id;
      if (tags) await setTags(client, id, tags, req.user.id);
      await client.query('COMMIT');
      await logAction(req.user.id, 'document.create', `document ${id}`);
      const doc = (await query(`SELECT ${DOC_COLS} FROM documents WHERE id = $1`, [id])).rows[0];
      res.status(201).json({ ...doc, tags: await tagsOf(id) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (isUnique(err)) return res.status(409).json({ error: 'Slug already exists' });
      if (err.code === '23503') return bad(res, 'Unknown category');
      throw err;
    } finally {
      client.release();
    }
  }));

  router.put('/documents/:id', content, wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (id === null) return notFound(res);
    const { fields, tags, error } = parseDoc(req.body, { partial: true });
    if (error) return bad(res, error);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cols = Object.keys(fields);
      const sets = [...cols.map((c, i) => `${c} = $${i + 1}`), 'updated_at = now()'];
      const upd = await client.query(`UPDATE documents SET ${sets.join(', ')} WHERE id = $${cols.length + 1} RETURNING id`, [...cols.map((c) => fields[c]), id]);
      if (!upd.rows.length) {
        await client.query('ROLLBACK');
        return notFound(res);
      }
      if (tags) await setTags(client, id, tags, req.user.id);
      await client.query('COMMIT');
      await logAction(req.user.id, 'document.update', `document ${id}${fields.status ? ` status=${fields.status}` : ''}`);
      const doc = (await query(`SELECT ${DOC_COLS} FROM documents WHERE id = $1`, [id])).rows[0];
      res.json({ ...doc, tags: await tagsOf(id) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (isUnique(err)) return res.status(409).json({ error: 'Slug already exists' });
      if (err.code === '23503') return bad(res, 'Unknown category');
      throw err;
    } finally {
      client.release();
    }
  }));

  router.delete('/documents/:id', content, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const del = id === null ? null : await query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    if (!del?.rows.length) return notFound(res);
    await logAction(req.user.id, 'document.delete', `document ${id}`);
    res.json({ ok: true });
  }));

  // Categories
  router.get('/categories', taxonomy, wrap(async (_req, res) => {
    res.json((await query('SELECT id, name, name_vi, slug FROM categories ORDER BY id')).rows);
  }));

  const parseNamed = (b, withVi) => {
    if (typeof b?.name !== 'string' || !b.name.trim() || b.name.length > 100) return { error: 'name is required' };
    if (withVi && b.name_vi != null && typeof b.name_vi !== 'string') return { error: 'Invalid name_vi' };
    const name = b.name.trim();
    const slug = slugify(name.toLowerCase());
    if (!slug) return { error: 'name must contain letters or digits' };
    return { name, slug, name_vi: b.name_vi ?? null };
  };

  router.post('/categories', taxonomy, wrap(async (req, res) => {
    const p = parseNamed(req.body, true);
    if (p.error) return bad(res, p.error);
    try {
      const row = (await query('INSERT INTO categories (name, name_vi, slug) VALUES ($1, $2, $3) RETURNING id, name, name_vi, slug', [p.name, p.name_vi, p.slug])).rows[0];
      await logAction(req.user.id, 'category.create', `category ${row.id}`);
      res.status(201).json(row);
    } catch (err) {
      if (isUnique(err)) return res.status(409).json({ error: 'Category already exists' });
      throw err;
    }
  }));

  router.put('/categories/:id', taxonomy, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const p = parseNamed(req.body, true);
    if (p.error) return bad(res, p.error);
    try {
      const row = id === null ? null : (await query('UPDATE categories SET name = $1, name_vi = $2, slug = $3 WHERE id = $4 RETURNING id, name, name_vi, slug', [p.name, p.name_vi, p.slug, id])).rows[0];
      if (!row) return notFound(res);
      await logAction(req.user.id, 'category.update', `category ${id}`);
      res.json(row);
    } catch (err) {
      if (isUnique(err)) return res.status(409).json({ error: 'Category already exists' });
      throw err;
    }
  }));

  router.delete('/categories/:id', taxonomy, wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (id === null) return notFound(res);
    const used = (await query('SELECT count(*)::int AS n FROM documents WHERE category_id = $1', [id])).rows[0].n;
    if (used) return res.status(409).json({ error: 'Category is in use' });
    const del = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (!del.rows.length) return notFound(res);
    await logAction(req.user.id, 'category.delete', `category ${id}`);
    res.json({ ok: true });
  }));

  // Tags
  router.get('/tags', taxonomy, wrap(async (_req, res) => {
    res.json((await query('SELECT id, name, slug FROM tags ORDER BY name')).rows);
  }));

  router.post('/tags', taxonomy, wrap(async (req, res) => {
    const p = parseNamed(req.body, false);
    if (p.error) return bad(res, p.error);
    try {
      const row = (await query('INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id, name, slug', [p.name, p.slug])).rows[0];
      await logAction(req.user.id, 'tag.create', `tag ${row.id}`);
      res.status(201).json(row);
    } catch (err) {
      if (isUnique(err)) return res.status(409).json({ error: 'Tag already exists' });
      throw err;
    }
  }));

  router.put('/tags/:id', taxonomy, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const p = parseNamed(req.body, false);
    if (p.error) return bad(res, p.error);
    try {
      const row = id === null ? null : (await query('UPDATE tags SET name = $1, slug = $2 WHERE id = $3 RETURNING id, name, slug', [p.name, p.slug, id])).rows[0];
      if (!row) return notFound(res);
      await logAction(req.user.id, 'tag.update', `tag ${id}`);
      res.json(row);
    } catch (err) {
      if (isUnique(err)) return res.status(409).json({ error: 'Tag already exists' });
      throw err;
    }
  }));

  router.delete('/tags/:id', taxonomy, wrap(async (req, res) => {
    const id = toId(req.params.id);
    const del = id === null ? null : await query('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);
    if (!del?.rows.length) return notFound(res);
    await logAction(req.user.id, 'tag.delete', `tag ${id}`);
    res.json({ ok: true });
  }));

  return router;
}
