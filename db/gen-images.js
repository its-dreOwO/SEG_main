// Generates one flat SVG per product into web/public/img/products/<slug>.svg.
// Solid fills only: no gradients, no filters. Run from anywhere: node db/gen-images.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from './data/products.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.resolve(dir, '../web/public/img/products');

// Pastel background per category.
const BACKGROUNDS = {
  phones: '#dbe9f7',
  headphones: '#f3dbe9',
  speakers: '#dff3e4',
  laptops: '#e4e0f7',
  'desktop-pcs': '#f7eedb',
  monitors: '#d9f0f0',
  'keyboards-mice': '#f7dfdb',
  'smart-watches': '#e8f2d9',
};

const BODY_COLOURS = ['#2b2f3a', '#3d4450', '#c9ced6', '#4a3f5c'];
const ACCENTS = ['#4f8ef7', '#f2a65a', '#5cc8a0', '#e56b8a', '#8c7ae6', '#f0c24b'];
const SCREEN = '#e9f1fb';

// FNV-1a hash so each slug always gets the same variation.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Nudge a pastel hex colour a few steps lighter or darker per product.
function nudge(hex, n) {
  const delta = (n % 13) - 6;
  const parts = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.min(255, Math.max(0, v + delta)).toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const rect = (x, y, w, h, rx, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const circle = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const drawings = {
  phones: (c) => [
    rect(140, 50, 120, 210, 18, c.body),
    rect(150, 64, 100, 182, 8, c.screen),
    circle(200, 56, 3, c.body2),
    rect(180, 244, 40, 5, 2.5, c.body2),
  ],
  headphones: (c) => [
    `<path d="M118 178 V132 A82 82 0 0 1 282 132 V178" fill="none" stroke="${c.body}" stroke-width="14" stroke-linecap="round"/>`,
    rect(100, 160, 40, 64, 16, c.body),
    rect(260, 160, 40, 64, 16, c.body),
    rect(108, 170, 24, 44, 10, c.accent),
    rect(268, 170, 24, 44, 10, c.accent),
  ],
  speakers: (c) => [
    rect(135, 52, 130, 210, 24, c.body),
    circle(200, 96, 14, c.body2),
    circle(200, 178, 42, c.body2),
    circle(200, 178, 22, c.accent),
  ],
  laptops: (c) => [
    rect(108, 52, 184, 130, 8, c.body),
    rect(118, 62, 164, 110, 3, c.screen),
    rect(80, 182, 240, 14, 7, c.body2),
    rect(170, 182, 60, 5, 2.5, c.accent),
  ],
  'desktop-pcs': (c) => [
    rect(150, 46, 100, 214, 10, c.body),
    rect(162, 62, 76, 8, 4, c.body2),
    rect(162, 80, 76, 8, 4, c.body2),
    rect(162, 98, 76, 8, 4, c.body2),
    circle(200, 226, 6, c.accent),
  ],
  monitors: (c) => [
    rect(88, 52, 224, 150, 10, c.body),
    rect(100, 64, 200, 126, 4, c.screen),
    rect(120, 170, 160, 52, 4, c.body2),
    rect(186, 202, 28, 18, 0, c.body),
    rect(150, 220, 100, 10, 5, c.body),
  ],
  keyboards: (c) => {
    const parts = [rect(66, 136, 268, 98, 12, c.body)];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 12; col++) {
        const x = 80 + col * 21;
        const y = 150 + row * 19;
        parts.push(rect(x, y, 17, 13, 3, (row + col) % 7 === 0 ? c.accent : c.key));
      }
    }
    return parts;
  },
  mouse: (c) => [
    rect(160, 92, 80, 130, 40, c.body),
    rect(198, 98, 4, 46, 2, c.body2),
    rect(160, 152, 80, 3, 0, c.body2),
    rect(186, 92, 28, 50, 14, c.accent),
  ],
  watches: (c) => [
    rect(172, 30, 56, 60, 8, c.body2),
    rect(172, 200, 56, 60, 8, c.body2),
    rect(158, 84, 84, 112, 22, c.body),
    rect(168, 96, 64, 88, 16, c.screen),
    rect(246, 130, 6, 24, 3, c.body2),
  ],
};

export function productSvg(p) {
  const h = hash(p.slug);
  const bg = nudge(BACKGROUNDS[p.category], h);
  const bodyFill = BODY_COLOURS[h % BODY_COLOURS.length];
  const colours = {
    body: bodyFill,
    body2: bodyFill === '#c9ced6' ? '#9aa3b0' : '#5a6270',
    accent: ACCENTS[(h >>> 4) % ACCENTS.length],
    screen: SCREEN,
    key: bodyFill === '#c9ced6' ? '#eef1f5' : '#6b7383',
  };
  let shapes;
  if (p.category === 'keyboards-mice') shapes = p.mouse ? drawings.mouse(colours) : drawings.keyboards(colours);
  else if (p.category === 'smart-watches') shapes = drawings.watches(colours);
  else shapes = drawings[p.category](colours);

  const label = esc(p.brand);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300" role="img"',
    ` aria-label="${esc(p.title)}">`,
    `<rect width="400" height="300" fill="${bg}"/>`,
    ...shapes,
    `<text x="200" y="284" font-family="Arial, Helvetica, sans-serif" font-size="13" text-anchor="middle" fill="#3a3f4b">${label}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

export function generateImages(outDir = OUT_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const p of products) {
    fs.writeFileSync(path.join(outDir, `${p.slug}.svg`), productSvg(p), 'utf8');
  }
  return products.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`wrote ${generateImages()} SVGs to ${OUT_DIR}`);
}
