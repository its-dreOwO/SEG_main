import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../src/db.js';
import { resetDb } from './helpers.js';
import { products } from '../../db/data/products.js';
import { articles } from '../../db/data/articles.js';
import { roles, users, categories } from '../../db/data/users.js';
import { seedContent } from '../../db/seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'web', 'public');
const CATEGORY_SLUGS = categories.map(([slug]) => slug).sort();
const STAFF_NAMES = new Set(users.filter((u) => u.role !== 'customer').map((u) => u.name));
const VI_DIACRITICS = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ]/i;

before(async () => {
  await resetDb();
  await seedContent();
});
after(() => pool.end());

test('at least 100 products across the 8 category slugs', () => {
  assert.ok(products.length >= 100, `only ${products.length} products`);
  const used = new Set(products.map((p) => p.category));
  assert.deepEqual([...used].sort(), CATEGORY_SLUGS);
  for (const slug of CATEGORY_SLUGS) {
    const n = products.filter((p) => p.category === slug).length;
    assert.ok(n >= 10, `${slug} has only ${n} products`);
  }
  assert.ok(articles.length >= 3);
});

test('no empty fields on any product', () => {
  const required = ['slug', 'title', 'title_vi', 'summary', 'summary_vi', 'content', 'category', 'brand', 'image',
    'image_alt', 'author', 'seo_title', 'seo_description', 'seo_keywords'];
  for (const p of products) {
    for (const k of required) {
      assert.ok(typeof p[k] === 'string' && p[k].trim().length > 0, `${p.slug}.${k} is empty`);
    }
    assert.ok(Array.isArray(p.tags) && p.tags.length > 0, `${p.slug}.tags is empty`);
    assert.ok(typeof p.price === 'number' && p.price > 0, `${p.slug}.price`);
    assert.ok(p.compare_at_price === null || p.compare_at_price > p.price, `${p.slug}.compare_at_price`);
    assert.ok(Number.isInteger(p.stock) && p.stock >= 0 && p.stock <= 80, `${p.slug}.stock`);
    assert.ok(STAFF_NAMES.has(p.author), `${p.slug}.author is not a seeded staff name`);
  }
});

test('content is 2 to 4 paragraphs followed by a spec list', () => {
  for (const p of products) {
    const paras = p.content.match(/<p>/g) ?? [];
    assert.ok(paras.length >= 2 && paras.length <= 4, `${p.slug} has ${paras.length} paragraphs`);
    assert.match(p.content, /<ul><li>[^<]+<\/li>.*<\/ul>$/, `${p.slug} has no spec list`);
  }
});

test('vietnamese summaries carry diacritics', () => {
  for (const p of [...products, ...articles]) {
    assert.match(p.summary_vi, VI_DIACRITICS, `${p.slug} summary_vi has no Vietnamese diacritics`);
  }
});

test('unique slugs and no duplicate description text', () => {
  const all = [...products, ...articles];
  assert.equal(new Set(all.map((p) => p.slug)).size, all.length, 'slugs must be unique');
  assert.equal(new Set(products.map((p) => p.content)).size, products.length, 'product content must be unique');
  assert.equal(new Set(products.map((p) => p.summary)).size, products.length, 'summaries must be unique');
});

test('no lorem ipsum anywhere in the catalogue', () => {
  assert.doesNotMatch(JSON.stringify([...products, ...articles]), /lorem/i);
});

test('every product image exists on disk and is a flat SVG', () => {
  for (const p of products) {
    assert.match(p.image, /^\/img\/products\/[a-z0-9-]+\.svg$/, p.slug);
    const file = path.join(webRoot, p.image);
    assert.ok(fs.existsSync(file), `missing image ${file}`);
    const svg = fs.readFileSync(file, 'utf8');
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /gradient/i, `${p.slug} SVG contains a gradient`);
    assert.doesNotMatch(svg, /<filter/i, `${p.slug} SVG contains a filter`);
  }
});

test('the seeded database holds the catalogue and demo engagement', async () => {
  const count = async (sql) => Number((await query(sql)).rows[0].n);
  assert.ok((await count("SELECT count(*) AS n FROM documents WHERE kind = 'product'")) >= 100);
  assert.equal(await count("SELECT count(*) AS n FROM documents WHERE kind = 'article'"), articles.length);
  assert.equal(await count('SELECT count(*) AS n FROM categories'), 8);
  assert.equal(await count('SELECT count(*) AS n FROM comments'), 150);
  assert.equal(await count('SELECT count(*) AS n FROM ratings'), 300);
  assert.equal(await count('SELECT count(*) AS n FROM flags'), 5);
  assert.equal(await count('SELECT count(*) AS n FROM orders'), 15);
  assert.equal(await count('SELECT count(*) AS n FROM search_click_log'), 250);
  assert.equal(await count('SELECT count(*) AS n FROM page_views'), 500);
  assert.equal(await count('SELECT count(*) AS n FROM roles'), roles.length);
});
