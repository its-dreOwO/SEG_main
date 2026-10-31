import express from 'express';
import { query } from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

export default app;
