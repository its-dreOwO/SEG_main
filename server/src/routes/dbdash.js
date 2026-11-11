import express from 'express';
import { query } from '../db.js';
import { requireAuth, requirePermission, wrap } from '../auth.js';
import { escapeLike } from './catalog.js';
import { bad, notFound, toId, paginate } from './admin/util.js';

const SORTS = {
  newest: 'd.created_at DESC, d.id DESC',
  title: 'd.title ASC, d.id DESC',
  stock_asc: 'd.stock ASC, d.id DESC',
  stock_desc: 'd.stock DESC, d.id DESC',
  price_asc: 'd.price ASC NULLS LAST, d.id DESC',
  price_desc: 'd.price DESC NULLS LAST, d.id DESC',
  views: 'd.views_count DESC, d.id DESC',
  comments: 'comment_count DESC, d.id DESC',
};
const STOCK = { in: 'd.stock > 0', low: 'd.stock BETWEEN 1 AND 10', out: 'd.stock = 0' };

const num = (v) => (v == null ? null : Number(v));

export function createDbDashRouter() {
  const router = express.Router();
  // Read-only dashboard: every route is a GET running SELECTs only.
  router.use(requireAuth, requirePermission('db.view'));

  // Optional text param: returns the trimmed value ('' if absent), or undefined after sending a 400.
  const text = (req, res, key) => {
    const v = req.query[key];
    if (v === undefined) return '';
    if (typeof v !== 'string' || v.length > 100) return bad(res, `Invalid ${key}`) && undefined;
    return v.trim();
  };

  router.get('/summary', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM documents WHERE kind = 'product') AS products,
         (SELECT count(*)::int FROM documents WHERE kind = 'product' AND stock > 0) AS in_stock,
         (SELECT count(*)::int FROM documents WHERE kind = 'product' AND stock = 0) AS out_of_stock,
         (SELECT coalesce(sum(stock), 0)::int FROM documents WHERE kind = 'product') AS units,
         (SELECT count(*)::int FROM tags) AS tags,
         (SELECT count(*)::int FROM comments c JOIN documents d ON d.id = c.document_id WHERE d.kind = 'product') AS comments,
         (SELECT count(*)::int FROM search_click_log) AS log_rows`,
    );
    res.json(rows[0]);
  }));

  router.get('/tags', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT t.id, t.name, t.slug, count(d.id)::int AS product_count
         FROM tags t
         LEFT JOIN document_tags dt ON dt.tag_id = t.id
         LEFT JOIN documents d ON d.id = dt.document_id AND d.kind = 'product'
        GROUP BY t.id ORDER BY t.name, t.id`,
    );
    res.json({ items: rows });
  }));

  router.get('/categories', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.slug, c.name, count(d.id)::int AS product_count
         FROM categories c
         LEFT JOIN documents d ON d.category_id = c.id AND d.kind = 'product'
        GROUP BY c.id ORDER BY c.name, c.id`,
    );
    res.json({ items: rows });
  }));

  router.get('/products', wrap(async (req, res) => {
    const q = text(req, res, 'q');
    if (q === undefined) return;
    for (const k of ['tag', 'category', 'stock', 'sort']) {
      if (req.query[k] !== undefined && typeof req.query[k] !== 'string') return bad(res, `Invalid ${k}`);
    }
    const sort = req.query.sort ?? 'newest';
    if (!Object.hasOwn(SORTS, sort)) return bad(res, 'Invalid sort');
    const { stock } = req.query;
    if (stock !== undefined && !Object.hasOwn(STOCK, stock)) return bad(res, 'Invalid stock');

    const where = ["d.kind = 'product'"];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };

    if (q) {
      const like = p(`%${escapeLike(q)}%`);
      const parts = [
        `d.document_search LIKE f_unaccent(lower(${like})) ESCAPE '\\'`,
        `f_unaccent(lower(coalesce(d.brand, ''))) LIKE f_unaccent(lower(${like})) ESCAPE '\\'`,
        `EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                 WHERE dt.document_id = d.id AND f_unaccent(lower(t.name)) LIKE f_unaccent(lower(${like})) ESCAPE '\\')`,
      ];
      if (/^\d{1,9}$/.test(q)) parts.push(`d.id = ${p(Number(q))}`);
      where.push(`(${parts.join(' OR ')})`);
    }
    if (req.query.tag) {
      where.push(`EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                           WHERE dt.document_id = d.id AND t.slug = ${p(req.query.tag)})`);
    }
    if (req.query.category) where.push(`c.slug = ${p(req.query.category)}`);
    if (stock !== undefined) where.push(STOCK[stock]);

    const out = await paginate(req, res, {
      from: 'FROM documents d LEFT JOIN categories c ON c.id = d.category_id WHERE ' + where.join(' AND '),
      params,
      select: `d.id, d.title, d.slug, d.brand, c.name AS category, c.slug AS category_slug, d.price::float AS price,
        d.stock, d.views_count, d.status, d.created_at,
        coalesce((SELECT array_agg(t.name ORDER BY t.name) FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                   WHERE dt.document_id = d.id), '{}') AS tags,
        (SELECT count(*)::int FROM comments cm WHERE cm.document_id = d.id) AS comment_count`,
      order: SORTS[sort],
    });
    if (out) res.json(out);
  }));

  // Returns the id if it belongs to an existing product, else null.
  const productId = async (req) => {
    const id = toId(req.params.id);
    if (id === null) return null;
    const { rows } = await query("SELECT 1 FROM documents WHERE id = $1 AND kind = 'product'", [id]);
    return rows.length ? id : null;
  };

  router.get('/products/:id', wrap(async (req, res) => {
    const id = await productId(req);
    if (id === null) return notFound(res);
    const { rows } = await query(
      `SELECT d.id, d.title, d.title_vi, d.slug, d.brand, c.name AS category, c.slug AS category_slug,
              d.price::float AS price, d.compare_at_price::float AS compare_at_price, d.stock, d.views_count,
              d.status, d.author, d.summary, d.image_url, d.image_alt, d.created_at, d.updated_at,
              (SELECT count(*)::int FROM comments cm WHERE cm.document_id = d.id) AS comment_count,
              (SELECT count(*)::int FROM comments cm WHERE cm.document_id = d.id AND cm.parent_id IS NOT NULL) AS reply_count,
              (SELECT round(avg(r.value), 2) FROM ratings r WHERE r.document_id = d.id) AS rating_avg,
              (SELECT count(*)::int FROM ratings r WHERE r.document_id = d.id) AS rating_count,
              (SELECT count(*)::int FROM likes l WHERE l.document_id = d.id) AS like_count
         FROM documents d LEFT JOIN categories c ON c.id = d.category_id WHERE d.id = $1`,
      [id],
    );
    const tags = (await query(
      `SELECT t.id, t.name, t.slug, u.display_name AS added_by, dt.created_at
         FROM document_tags dt JOIN tags t ON t.id = dt.tag_id LEFT JOIN users u ON u.id = dt.added_by
        WHERE dt.document_id = $1 ORDER BY t.name`, [id])).rows;
    res.json({ ...rows[0], rating_avg: num(rows[0].rating_avg), tags });
  }));

  router.get('/products/:id/comments', wrap(async (req, res) => {
    const id = await productId(req);
    if (id === null) return notFound(res);
    const top = req.query.top === '1' ? ' AND c.parent_id IS NULL' : '';
    const out = await paginate(req, res, {
      from: `FROM comments c JOIN users u ON u.id = c.user_id WHERE c.document_id = $1${top}`,
      params: [id],
      select: `c.id, c.parent_id, c.created_at, c.user_id, u.display_name AS author, c.status, c.body,
        (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id) AS reply_count`,
      order: 'c.created_at DESC, c.id DESC',
    });
    if (out) res.json(out);
  }));

  router.get('/search-log', wrap(async (req, res) => {
    const q = text(req, res, 'q');
    if (q === undefined) return;
    const { clicked } = req.query;
    if (clicked !== undefined && !['yes', 'no'].includes(clicked)) return bad(res, 'Invalid clicked');
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      where.push(`l.query_string ILIKE $${params.length} ESCAPE '\\'`);
    }
    if (clicked) where.push(`l.clicked_doc_id IS ${clicked === 'yes' ? 'NOT ' : ''}NULL`);
    const out = await paginate(req, res, {
      from: `FROM search_click_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN documents d ON d.id = l.clicked_doc_id${where.length ? ' WHERE ' + where.join(' AND ') : ''}`,
      params,
      select: `l.id, l.user_id, u.display_name AS user_name, l.query_string, l.clicked_doc_id,
        d.title AS clicked_title, l.result_count, l."timestamp"`,
      order: 'l."timestamp" DESC, l.id DESC',
    });
    if (out) res.json(out);
  }));

  return router;
}
