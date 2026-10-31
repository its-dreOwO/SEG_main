import express from 'express';
import { pool, query } from '../db.js';
import { requireAuth, wrap } from '../auth.js';

const bad = (res, msg) => res.status(400).json({ error: msg });

const ORDER_COLS = 'id, status, total::float AS total, customer_name, address, phone, created_at';
const ITEMS_SQL = `SELECT order_id, document_id, title, unit_price::float AS unit_price, quantity
                     FROM order_items WHERE order_id = ANY($1) ORDER BY id`;

async function withItems(orders) {
  if (!orders.length) return orders;
  const items = (await query(ITEMS_SQL, [orders.map((o) => o.id)])).rows;
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id).map(({ order_id, ...i }) => i) }));
}

export function createOrdersRouter() {
  const router = express.Router();

  router.post('/orders', requireAuth, wrap(async (req, res) => {
    const { items, address, clientToken } = req.body ?? {};
    if (typeof clientToken !== 'string' || !clientToken.trim() || clientToken.length > 100) return bad(res, 'Invalid clientToken');
    if (typeof address !== 'string' || !address.trim() || address.length > 500) return bad(res, 'Invalid address');
    if (!Array.isArray(items) || !items.length || items.length > 50) return bad(res, 'Invalid items');
    const wanted = new Map();
    for (const it of items) {
      if (!Number.isInteger(it?.docId) || !Number.isInteger(it?.qty) || it.qty < 1 || it.qty > 1000) {
        return bad(res, 'Each item needs an integer docId and qty of at least 1');
      }
      wanted.set(it.docId, (wanted.get(it.docId) ?? 0) + it.qty);
    }
    const ids = [...wanted.keys()].sort((x, y) => x - y);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const docs = (await client.query(
        `SELECT id, title, price, stock FROM documents
          WHERE id = ANY($1) AND status = 'published' AND kind = 'product' AND price IS NOT NULL
          ORDER BY id FOR UPDATE`, [ids])).rows;
      // Taken after the row locks so a concurrent retry with the same token sees the first order.
      const existing = (await client.query('SELECT id FROM orders WHERE user_id = $1 AND client_token = $2', [req.user.id, clientToken])).rows[0];
      if (existing) {
        await client.query('ROLLBACK');
        const o = (await query(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1`, [existing.id])).rows;
        return res.status(200).json((await withItems(o))[0]);
      }
      if (docs.length !== ids.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found' });
      }
      for (const d of docs) {
        if (wanted.get(d.id) > d.stock) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Not enough stock for ${d.title}` });
        }
      }
      const total = docs.reduce((s, d) => s + Math.round(Number(d.price) * 100) * wanted.get(d.id), 0) / 100;
      const name = (await client.query('SELECT display_name FROM users WHERE id = $1', [req.user.id])).rows[0].display_name;
      const orderId = (await client.query(
        `INSERT INTO orders (user_id, client_token, total, customer_name, address) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, clientToken, total, name, address.trim()])).rows[0].id;
      for (const d of docs) {
        await client.query(
          'INSERT INTO order_items (order_id, document_id, title, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)',
          [orderId, d.id, d.title, d.price, wanted.get(d.id)]);
        await client.query('UPDATE documents SET stock = stock - $1 WHERE id = $2', [wanted.get(d.id), d.id]);
      }
      await client.query('COMMIT');
      const o = (await query(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1`, [orderId])).rows;
      res.status(201).json((await withItems(o))[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }));

  router.get('/orders', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(`SELECT ${ORDER_COLS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, [req.user.id]);
    res.json(await withItems(rows));
  }));

  router.get('/orders/:id', requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json((await withItems(rows))[0]);
  }));

  return router;
}
