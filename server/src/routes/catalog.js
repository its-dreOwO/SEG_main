import express from 'express';
import { query } from '../db.js';
import { optionalAuth, wrap } from '../auth.js';
import { searchClause } from '../search/engine.js';

const SORTS = {
  newest: 'd.created_at DESC, d.id DESC',
  price_asc: 'd.price ASC NULLS LAST, d.id DESC',
  price_desc: 'd.price DESC NULLS LAST, d.id DESC',
  top: 'sold DESC, d.created_at DESC, d.id DESC',
  views: 'd.views_count DESC, d.created_at DESC, d.id DESC',
  relevance: null, // BM25 score; only meaningful with a text query, falls back to newest without one
};

export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const num = (v) => (v == null ? null : Number(v));

const LIST_SELECT = `
  d.id, d.slug, d.title, d.title_vi, d.summary, d.summary_vi, d.price::float AS price,
  d.compare_at_price::float AS compare_at_price, d.image_url, d.image_alt, d.brand,
  c.name AS category, c.slug AS category_slug, d.stock, d.created_at, d.views_count, d.author, d.kind,
  (SELECT round(avg(r.value), 1)::float FROM ratings r WHERE r.document_id = d.id) AS rating,
  (SELECT count(*)::int FROM ratings r WHERE r.document_id = d.id) AS rating_count,
  (SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi WHERE oi.document_id = d.id) AS sold`;

const bad = (res, msg) => res.status(400).json({ error: msg });

export function createCatalogRouter() {
  const router = express.Router();

  router.get('/settings/public', wrap(async (_req, res) => {
    const { rows } = await query('SELECT key, value FROM settings');
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      storeName: s.store_name ?? 'Volt',
      banner: s.promo_banner ?? '',
      vndRate: Number(s.vnd_rate) || 25000,
      moderation: s.comment_moderation === 'on',
    });
  }));

  router.get('/categories', wrap(async (_req, res) => {
    const { rows } = await query('SELECT id, name, name_vi, slug FROM categories ORDER BY id');
    res.json(rows);
  }));

  router.get('/tags', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT t.id, t.name, t.slug, count(d.id)::int AS count
         FROM tags t
         LEFT JOIN document_tags dt ON dt.tag_id = t.id
         LEFT JOIN documents d ON d.id = dt.document_id AND d.status = 'published'
        GROUP BY t.id ORDER BY t.name`,
    );
    res.json(rows);
  }));

  router.get('/documents', optionalAuth, wrap(async (req, res) => {
    const q = req.query;
    for (const k of ['q', 'category', 'tag', 'from', 'to', 'minPrice', 'maxPrice', 'kind', 'sort', 'page', 'limit']) {
      if (q[k] !== undefined && typeof q[k] !== 'string') return bad(res, `Invalid ${k}`);
    }
    const page = q.page === undefined ? 1 : Number(q.page);
    const limit = q.limit === undefined ? 12 : Number(q.limit);
    if (!Number.isInteger(page) || page < 1) return bad(res, 'Invalid page');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return bad(res, 'Invalid limit');
    const term = (q.q ?? '').trim();
    const sort = q.sort ?? (term ? 'relevance' : 'newest');
    if (!(sort in SORTS)) return bad(res, 'Invalid sort');

    const where = ["d.status = 'published'"];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };

    // Text query: BM25 over the inverted index (server/src/search/engine.js).
    const match = term ? await searchClause(term, 'bm25', p) : null;
    if (match) where.push(...match.where);
    if (q.category) where.push(`c.slug = ${p(q.category)}`);
    if (q.tag) {
      where.push(`EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                           WHERE dt.document_id = d.id AND t.slug = ${p(q.tag)})`);
    }
    if (q.kind) {
      if (!['product', 'article'].includes(q.kind)) return bad(res, 'Invalid kind');
      where.push(`d.kind = ${p(q.kind)}`);
    }
    if (q.from) {
      if (!isDate(q.from)) return bad(res, 'Invalid from date (YYYY-MM-DD)');
      where.push(`d.created_at >= ${p(q.from)}::date`);
    }
    if (q.to) {
      if (!isDate(q.to)) return bad(res, 'Invalid to date (YYYY-MM-DD)');
      where.push(`d.created_at < ${p(q.to)}::date + 1`);
    }
    for (const [key, op] of [['minPrice', '>='], ['maxPrice', '<=']]) {
      if (q[key] === undefined || q[key] === '') continue;
      const v = Number(q[key]);
      if (!Number.isFinite(v) || v < 0 || v > 99999999) return bad(res, `Invalid ${key}`);
      where.push(`d.price ${op} ${p(v)}`);
    }

    const cte = match?.cte ?? '';
    const from = `FROM documents d ${match?.join ?? ''} LEFT JOIN categories c ON c.id = d.category_id WHERE ${where.join(' AND ')}`;
    const order = sort === 'relevance' ? (match?.order ?? SORTS.newest) : SORTS[sort];
    const total = (await query(`${cte}SELECT count(*)::int AS n ${from}`, params)).rows[0].n;
    const limitP = `$${params.length + 1}`;
    const offsetP = `$${params.length + 2}`;
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `${cte}SELECT ${LIST_SELECT}, ${match?.score ?? 'NULL::float8'} AS score ${from} ORDER BY ${order} LIMIT ${limitP} OFFSET ${offsetP}`,
      [...params, limit, offset],
    );
    const items = rows.map(({ sold, score, ...rest }) => (score == null ? rest : { ...rest, score: Math.round(Number(score) * 1000) / 1000 }));

    // Every text search is logged with the ranked ids shown, so clicks can be tied to a rank for evaluation.
    let searchId;
    if (term) {
      const logged = await query(
        `INSERT INTO search_click_log (user_id, query_string, result_count, result_ids, result_offset, sort)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.user?.id ?? null, term.slice(0, 200), total, items.map((i) => i.id), offset, sort],
      );
      searchId = logged.rows[0].id;
    }
    res.json({ items, total, page, pages: Math.ceil(total / limit), ...(searchId ? { searchId } : {}) });
  }));

  router.get('/documents/:slug', optionalAuth, wrap(async (req, res) => {
    const found = await query(
      "UPDATE documents SET views_count = views_count + 1 WHERE slug = $1 AND status = 'published' RETURNING id",
      [req.params.slug],
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Not found' });
    const id = found.rows[0].id;
    await query('INSERT INTO page_views (document_id) VALUES ($1)', [id]);
    const uid = req.user?.id ?? null;

    const { rows } = await query(
      `SELECT ${LIST_SELECT}, d.content, d.content_vi, d.seo_title, d.seo_description, d.seo_keywords,
              (SELECT count(*)::int FROM likes l WHERE l.document_id = d.id) AS likes_count,
              EXISTS (SELECT 1 FROM likes l WHERE l.document_id = d.id AND l.user_id = $2) AS liked,
              (SELECT r.value FROM ratings r WHERE r.document_id = d.id AND r.user_id = $2) AS my_rating
         FROM documents d LEFT JOIN categories c ON c.id = d.category_id WHERE d.id = $1`,
      [id, uid],
    );
    const { sold, ...doc } = rows[0];
    const tags = (await query(
      `SELECT t.id, t.name, t.slug, dt.added_by FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
        WHERE dt.document_id = $1 ORDER BY t.name`, [id])).rows;
    const comments = (await query(
      `SELECT c.id, c.parent_id, c.user_id, c.body, c.created_at, u.display_name AS author
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.document_id = $1 AND c.status = 'visible' ORDER BY c.created_at, c.id`, [id])).rows;
    res.json({ ...doc, my_rating: num(doc.my_rating), tags, comments });
  }));

  return router;
}
