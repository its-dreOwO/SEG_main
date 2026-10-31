import express from 'express';
import { query } from '../../db.js';
import { requirePermission, wrap } from '../../auth.js';
import { logAction } from '../../log.js';
import { bad, notFound, toId, paginate } from './util.js';

const SEO_FIELDS = ['seo_title', 'seo_description', 'seo_keywords', 'image_alt'];

export function createSeoAdminRouter() {
  const router = express.Router();

  router.get('/seo', requirePermission('seo.manage'), wrap(async (req, res) => {
    const out = await paginate(req, res, {
      from: 'FROM documents',
      select: 'id, title, slug, status, seo_title, seo_description, seo_keywords, image_alt',
      order: 'id DESC',
    });
    if (out) res.json(out);
  }));

  // Updates SEO fields only; any other field in the body is ignored.
  router.put('/seo/:id', requirePermission('seo.manage'), wrap(async (req, res) => {
    const id = toId(req.params.id);
    const b = req.body ?? {};
    const cols = SEO_FIELDS.filter((k) => b[k] !== undefined);
    if (!cols.length) return bad(res, 'No SEO fields provided');
    for (const k of cols) if (b[k] !== null && (typeof b[k] !== 'string' || b[k].length > 500)) return bad(res, `Invalid ${k}`);
    const upd = id === null ? null : await query(
      `UPDATE documents SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}
       RETURNING id, ${SEO_FIELDS.join(', ')}`,
      [...cols.map((c) => b[c]), id]);
    if (!upd?.rows.length) return notFound(res);
    await logAction(req.user.id, 'seo.update', `document ${id}`);
    res.json(upd.rows[0]);
  }));

  router.get('/analytics', requirePermission('analytics.view'), wrap(async (_req, res) => {
    const n = async (sql) => (await query(sql)).rows[0].n;
    const totals = {
      documents: await n('SELECT count(*)::int AS n FROM documents'),
      published: await n("SELECT count(*)::int AS n FROM documents WHERE status = 'published'"),
      users: await n('SELECT count(*)::int AS n FROM users'),
      orders: await n('SELECT count(*)::int AS n FROM orders'),
      revenue: await n('SELECT coalesce(sum(total), 0)::float AS n FROM orders'),
      views: await n('SELECT coalesce(sum(views_count), 0)::int AS n FROM documents'),
    };
    const topViewed = (await query(
      "SELECT id, title, slug, views_count FROM documents WHERE status = 'published' ORDER BY views_count DESC, id LIMIT 10")).rows;
    const topSearches = (await query(
      `SELECT lower(query_string) AS query, count(*)::int AS count FROM search_click_log
        WHERE query_string <> '' AND clicked_doc_id IS NULL GROUP BY 1 ORDER BY count DESC, query LIMIT 10`)).rows;
    const zeroResultSearches = (await query(
      `SELECT lower(query_string) AS query, count(*)::int AS count FROM search_click_log
        WHERE result_count = 0 AND query_string <> '' GROUP BY 1 ORDER BY count DESC, query LIMIT 10`)).rows;
    const searches = await n('SELECT count(*)::int AS n FROM search_click_log WHERE result_count IS NOT NULL');
    const clicks = await n('SELECT count(*)::int AS n FROM search_click_log WHERE clicked_doc_id IS NOT NULL');
    const viewsByDay = (await query(
      `SELECT to_char(viewed_at::date, 'YYYY-MM-DD') AS day, count(*)::int AS views FROM page_views
        WHERE viewed_at >= now() - interval '30 days' GROUP BY viewed_at::date ORDER BY viewed_at::date`)).rows;
    res.json({
      totals, topViewed, topSearches, zeroResultSearches,
      clickThrough: { searches, clicks, rate: searches ? clicks / searches : 0 },
      viewsByDay,
    });
  }));

  return router;
}
