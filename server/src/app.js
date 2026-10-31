import express from 'express';
import cookieParser from 'cookie-parser';
import { query } from './db.js';
import { createAuthRouter } from './routes/auth.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createEngagementRouter } from './routes/engagement.js';

const app = express();
app.disable('x-powered-by');
// Express listens on 127.0.0.1 behind Caddy, so exactly one proxy hop (Caddy) is trusted for req.ip.
// Caddy sets X-Forwarded-For from the connecting peer (a Cloudflare edge address); the client-supplied
// CF-Connecting-IP header is deliberately NOT trusted because the origin is not locked to Cloudflare.
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use('/api', createAuthRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createEngagementRouter());

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
