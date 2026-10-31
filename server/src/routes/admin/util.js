import { query } from '../../db.js';

export const bad = (res, msg) => res.status(400).json({ error: msg });
export const notFound = (res) => res.status(404).json({ error: 'Not found' });
export const toId = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);

// Runs a count and a page query; returns {items,total,page,pages} or null after sending a 400.
export async function paginate(req, res, { from, params = [], select, order }) {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(page) || page < 1) return bad(res, 'Invalid page') && null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad(res, 'Invalid limit') && null;
  const total = (await query(`SELECT count(*)::int AS n ${from}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT ${select} ${from} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  return { items: rows, total, page, pages: Math.ceil(total / limit) };
}
