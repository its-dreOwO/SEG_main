// DESTRUCTIVE: applies db/schema.sql (drops and recreates every table), then seeds base data.
// Usage from repo root: SEED_PASSWORD=... node db/seed.js --reset   (DATABASE_URL, or TEST_DATABASE_URL with NODE_ENV=test)
// Without --reset it refuses to run.
// Loads base data, then the product and article catalogue plus demo engagement (deterministic, see seedContent).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../server/src/db.js';
import { hashPassword } from '../server/src/password.js';
import { roles, permissions, rolePermissions, users, categories, settings } from './data/users.js';
import { products } from './data/products.js';
import { articles } from './data/articles.js';
import { REVIEW_PHRASES, QUERY_TARGETS, FLAG_REASONS, SAMPLE_ADDRESSES, SAMPLE_PHONES } from './data/demo.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Obscure queries with no product match, added to the zero-result pool next to the empty QUERY_TARGETS entries.
const EXTRA_NO_MATCH_QUERIES = ['nokia 3310', 'vr headset'];

// Demo data is generated from a fixed seed and a fixed clock so every run produces the same rows.
const DEMO_RNG_SEED = 20261031;
const DEMO_END = Date.UTC(2026, 9, 31, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

// mulberry32: small deterministic PRNG.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
// A timestamp uniformly within the 30 days before DEMO_END.
const recentTs = (rng) => new Date(DEMO_END - Math.floor(rng() * 30 * DAY_MS)).toISOString();

export async function applySchema() {
  await query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
}

export async function seedBase(password) {
  if (!password) throw new Error('SEED_PASSWORD is required');
  for (const [name, description] of roles) {
    await query('INSERT INTO roles (name, description) VALUES ($1, $2)', [name, description]);
  }
  for (const code of permissions) {
    await query('INSERT INTO permissions (code) VALUES ($1)', [code]);
  }
  for (const [role, codes] of Object.entries(rolePermissions)) {
    for (const code of codes) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = $1 AND p.code = $2`,
        [role, code],
      );
    }
  }
  const hash = await hashPassword(password);
  for (const u of users) {
    await query(
      `INSERT INTO users (email, password_hash, display_name, role_id)
       SELECT $1, $2, $3, id FROM roles WHERE name = $4`,
      [u.email, hash, u.name, u.role],
    );
  }
  for (const [slug, name, nameVi] of categories) {
    await query('INSERT INTO categories (slug, name, name_vi) VALUES ($1, $2, $3)', [slug, name, nameVi]);
  }
  for (const [key, value] of Object.entries(settings)) {
    await query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
  }
}

// Loads products, articles, tags and demo engagement. Call after seedBase on an empty schema.
export async function seedContent() {
  const rng = makeRng(DEMO_RNG_SEED);
  const { rows: catRows } = await query('SELECT id, slug FROM categories');
  const categoryId = new Map(catRows.map((r) => [r.slug, r.id]));
  const { rows: userRows } = await query(
    `SELECT u.id, u.display_name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id`,
  );
  const customers = userRows.filter((u) => u.role === 'customer');
  const moderator = userRows.find((u) => u.role === 'moderator');
  const editor = userRows.find((u) => u.role === 'content_manager');

  // Catalogue: products first, then articles. slug -> id is kept for the engagement rows below.
  const docId = new Map();
  const insertDoc = async (d) => {
    const { rows } = await query(
      `INSERT INTO documents (kind, title, title_vi, slug, content, summary, summary_vi, category_id, author,
         price, compare_at_price, stock, brand, image_url, image_alt, status, seo_title, seo_description, seo_keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        d.kind, d.title, d.title_vi, d.slug, d.content, d.summary, d.summary_vi,
        d.category ? categoryId.get(d.category) : null, d.author,
        d.price ?? null, d.compare_at_price ?? null, d.stock ?? 0, d.brand ?? null, d.image ?? null,
        d.image_alt ?? null, d.status, d.seo_title ?? null, d.seo_description ?? null, d.seo_keywords ?? null,
      ],
    );
    docId.set(d.slug, rows[0].id);
    return rows[0].id;
  };
  for (const p of products) await insertDoc(p);
  for (const a of articles) {
    await insertDoc({
      ...a,
      kind: 'article',
      content: `${a.paras.map((p) => `<p>${p}</p>`).join('')}<ul>${a.specs.map((s) => `<li>${s}</li>`).join('')}</ul>`,
      category: null,
      status: 'published',
      seo_description: a.summary,
      seo_keywords: 'buying guide',
    });
  }
  const productIds = products.map((p) => docId.get(p.slug));

  // Spread product created_at over the last 60 days in a shuffled (deterministic) order, so "newest" mixes categories.
  const order = productIds.map((_, i) => i);
  const dateRng = makeRng(DEMO_RNG_SEED + 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(dateRng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let k = 0; k < order.length; k++) {
    const ts = new Date(DEMO_END - Math.floor((k * 60 * DAY_MS) / order.length)).toISOString();
    await query('UPDATE documents SET created_at = $1, updated_at = $1 WHERE id = $2', [ts, productIds[order[k]]]);
  }
  const allIds = [...docId.values()];

  // Tags: one row per distinct tag name, linked to the product that carries it.
  const tagId = new Map();
  for (const p of products) {
    for (const name of p.tags) {
      if (!tagId.has(name)) {
        const { rows } = await query(
          'INSERT INTO tags (name, slug) VALUES ($1, $1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
          [name],
        );
        tagId.set(name, rows[0].id);
      }
      await query(
        'INSERT INTO document_tags (document_id, tag_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [docId.get(p.slug), tagId.get(name), editor?.id ?? null],
      );
    }
  }

  // Comments: about 150 short reviews from the customer accounts.
  const commentIds = [];
  const commentAuthor = new Map();
  for (let i = 0; i < 150; i++) {
    const author = pick(rng, customers);
    const { rows } = await query(
      `INSERT INTO comments (document_id, user_id, body, status, created_at)
       VALUES ($1, $2, $3, $5, $4) RETURNING id`,
      // The last four comments are held for the moderator queue.
      [pick(rng, productIds), author.id, pick(rng, REVIEW_PHRASES), recentTs(rng), i >= 146 ? 'pending' : 'visible'],
    );
    commentIds.push(rows[0].id);
    commentAuthor.set(rows[0].id, author.id);
  }

  // Ratings: every customer rates every product, which gives 3 x 100 = 300 rows.
  for (const c of customers) {
    for (const id of productIds) {
      const value = pick(rng, [5, 5, 4, 4, 4, 4, 3, 3, 2, 1]);
      await query('INSERT INTO ratings (user_id, document_id, value, created_at) VALUES ($1, $2, $3, $4)', [
        c.id, id, value, recentTs(rng),
      ]);
    }
  }

  // Flags: five reports (four left open) on distinct comments, reported by a customer who did not write the comment.
  const flaggedComments = commentIds.slice(0, 5);
  for (let i = 0; i < flaggedComments.length; i++) {
    const commentId = flaggedComments[i];
    const reporter = customers.find((c) => c.id !== commentAuthor.get(commentId)) ?? customers[0];
    const resolved = i < 1 && moderator; // one resolved, four open for the moderator queue
    await query(
      `INSERT INTO flags (comment_id, reporter_id, reason, resolution, resolved_by, resolved_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        commentId, reporter.id, pick(rng, FLAG_REASONS),
        resolved ? 'Reviewed by moderator' : null,
        resolved ? moderator.id : null,
        resolved ? recentTs(rng) : null,
        recentTs(rng),
      ],
    );
  }

  // Orders: 15 orders from the customers, each with 1 to 3 product lines.
  const statuses = ['placed', 'shipped', 'delivered'];
  for (let i = 0; i < 15; i++) {
    const customer = customers[i % customers.length];
    const lines = [];
    const count = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < count; j++) {
      const p = pick(rng, products);
      lines.push({ p, quantity: 1 + Math.floor(rng() * 2) });
    }
    const total = lines.reduce((sum, l) => sum + Number(l.p.price) * l.quantity, 0);
    const { rows } = await query(
      `INSERT INTO orders (user_id, client_token, status, total, customer_name, address, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        customer.id, `seed-order-${String(i + 1).padStart(3, '0')}`, pick(rng, statuses),
        total.toFixed(2), customer.display_name, pick(rng, SAMPLE_ADDRESSES), pick(rng, SAMPLE_PHONES), recentTs(rng),
      ],
    );
    for (const l of lines) {
      await query(
        `INSERT INTO order_items (order_id, document_id, title, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, docId.get(l.p.slug), l.p.title, Number(l.p.price).toFixed(2), l.quantity],
      );
    }
  }

  // Search log: 250 queries over 30 days. About 10% are zero-result queries (result_count 0, no click);
  // the rest have a positive result_count, and some of those are clicked.
  const hitQueries = QUERY_TARGETS.filter(([, targets]) => targets.length > 0);
  const missQueries = [
    ...QUERY_TARGETS.filter(([, targets]) => targets.length === 0).map(([text]) => text),
    ...EXTRA_NO_MATCH_QUERIES,
  ];
  for (let i = 0; i < 250; i++) {
    const miss = rng() < 0.1;
    const [text, targets] = miss ? [pick(rng, missQueries), []] : pick(rng, hitQueries);
    const clicked = targets.length && rng() < 0.75 ? docId.get(pick(rng, targets)) : null;
    const resultCount = miss ? 0 : 1 + Math.floor(rng() * 40);
    const userId = rng() < 0.4 ? null : pick(rng, customers).id;
    await query(
      `INSERT INTO search_click_log (user_id, query_string, clicked_doc_id, result_count, "timestamp")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, text, clicked, resultCount, recentTs(rng)],
    );
  }

  // Page views: 500 over 30 days, weighted toward a few popular products. Then sync views_count.
  for (let i = 0; i < 500; i++) {
    const hot = rng() < 0.6 ? productIds.slice(0, 15) : allIds;
    await query('INSERT INTO page_views (document_id, viewed_at) VALUES ($1, $2)', [pick(rng, hot), recentTs(rng)]);
  }
  await query(
    `UPDATE documents d SET views_count = s.n FROM
       (SELECT document_id, count(*)::int AS n FROM page_views GROUP BY document_id) s
     WHERE d.id = s.document_id`,
  );
}

// Validates everything first; only then drops tables. Destructive, so it needs { reset: true }.
export async function seedAll(password, { reset = false } = {}) {
  if (!password) throw new Error('SEED_PASSWORD is required');
  if (!reset) throw new Error('Refusing to drop and recreate tables without --reset');
  await applySchema();
  await seedBase(password);
  await seedContent();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await seedAll(process.env.SEED_PASSWORD, { reset: process.argv.includes('--reset') });
    console.log('seeded');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
