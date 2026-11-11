// Generates one flat illustration per product into web/public/img/products/<slug>.svg.
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

const path2 = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const ring = (cx, cy, r, stroke, w) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
const line = (x1, y1, x2, y2, stroke, w) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;

// A flat landscape (sky, sun, two hills) clipped to a display area, so a screen reads as switched on.
function scene(id, x, y, w, h, rx, c) {
  const b = y + h;
  return [
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    rect(x, y, w, h, 0, c.screen),
    circle(x + w * 0.74, y + h * 0.3, h * 0.13, c.accent),
    path2(`M${x} ${b} V${y + h * 0.66} Q${x + w * 0.22} ${y + h * 0.4} ${x + w * 0.46} ${y + h * 0.68} T${x + w} ${y + h * 0.56} V${b} Z`, '#9db9d6'),
    path2(`M${x} ${b} V${y + h * 0.84} Q${x + w * 0.3} ${y + h * 0.6} ${x + w * 0.62} ${y + h * 0.82} T${x + w} ${y + h * 0.76} V${b} Z`, '#5f7ea3'),
    '</g>',
  ];
}

const drawings = {
  // Front view: screen with a wallpaper, a clock, a row of app icons and a home bar.
  phones: (c) => [
    rect(138, 34, 124, 232, 20, c.body),
    ...scene('s', 145, 41, 110, 218, 14, c),
    rect(184, 48, 32, 9, 4.5, c.body),
    rect(170, 84, 60, 9, 4.5, '#ffffff'),
    rect(182, 100, 36, 5, 2.5, '#ffffff'),
    ...[0, 1, 2, 3].map((i) => rect(155 + i * 24, 222, 18, 18, 5, i === 1 ? c.accent : '#ffffff')),
    rect(180, 250, 40, 4, 2, '#ffffff'),
    rect(262, 96, 4, 34, 2, c.body2),
  ],
  // Over-ear pair: padded headband, yokes, ear cups with cushions.
  headphones: (c) => [
    `<path d="M112 172 V136 A88 88 0 0 1 288 136 V172" fill="none" stroke="${c.body}" stroke-width="16" stroke-linecap="round"/>`,
    `<path d="M150 74 A88 88 0 0 1 250 74" fill="none" stroke="${c.accent}" stroke-width="16" stroke-linecap="round"/>`,
    rect(106, 150, 12, 30, 6, c.body2),
    rect(282, 150, 12, 30, 6, c.body2),
    rect(88, 160, 50, 84, 22, c.body),
    rect(262, 160, 50, 84, 22, c.body),
    rect(128, 168, 16, 68, 8, c.body2),
    rect(256, 168, 16, 68, 8, c.body2),
    rect(98, 176, 20, 52, 10, c.accent),
    rect(282, 176, 20, 52, 10, c.accent),
  ],
  // Upright speaker: cabinet, tweeter, woofer with surround and dust cap, control strip.
  speakers: (c) => [
    rect(128, 40, 144, 226, 22, c.body),
    rect(140, 52, 120, 202, 14, c.body2),
    circle(200, 92, 20, c.body),
    circle(200, 92, 9, c.accent),
    circle(200, 178, 52, c.body),
    ring(200, 178, 40, c.body2, 6),
    circle(200, 178, 18, c.accent),
    circle(200, 178, 6, c.body),
    rect(178, 240, 44, 5, 2.5, c.body),
  ],
  // Open laptop: lid with a lit screen, hinge, keyboard deck with keys and trackpad.
  laptops: (c) => {
    const parts = [
      rect(96, 40, 208, 142, 10, c.body),
      ...scene('s', 104, 48, 192, 124, 4, c),
      circle(200, 44, 1.6, c.body2),
      path2('M70 232 L96 186 H304 L330 232 Z', c.body2),
      rect(64, 230, 272, 10, 5, c.body),
      rect(172, 230, 56, 4, 2, c.body2),
    ];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 11; col++) {
        const inset = row * 4;
        const w = (196 + inset * 2) / 11;
        parts.push(rect(102 - inset + col * w + 1.5, 191 + row * 8, w - 3, 5, 1.5, c.key));
      }
    }
    parts.push(rect(176, 216, 48, 9, 2, c.key));
    return parts;
  },
  // Tower PC: case with a glass side panel showing two fans, drive bays and a power light.
  'desktop-pcs': (c) => [
    rect(132, 36, 136, 222, 10, c.body),
    rect(132, 254, 30, 10, 3, c.body2),
    rect(238, 254, 30, 10, 3, c.body2),
    rect(144, 48, 82, 198, 6, c.body2),
    ...[98, 180].flatMap((cy) => [
      circle(185, cy, 30, c.body),
      ring(185, cy, 24, c.accent, 4),
      circle(185, cy, 7, c.accent),
      line(185, cy - 20, 185, cy + 20, c.body2, 3),
      line(165, cy, 205, cy, c.body2, 3),
    ]),
    rect(236, 54, 22, 6, 3, c.body2),
    rect(236, 66, 22, 6, 3, c.body2),
    circle(247, 96, 6, c.accent),
    rect(240, 116, 14, 4, 2, c.body2),
    rect(240, 126, 14, 4, 2, c.body2),
  ],
  // Display on a stand: thin bezel, a picture on screen, neck and foot.
  monitors: (c) => [
    rect(186, 196, 28, 44, 0, c.body2),
    rect(138, 238, 124, 10, 5, c.body),
    rect(62, 38, 276, 170, 8, c.body),
    ...scene('s', 69, 45, 262, 148, 3, c),
    circle(200, 200.5, 2.5, c.accent),
  ],
  keyboards: (c) => {
    const parts = [rect(52, 110, 296, 112, 12, c.body), rect(52, 214, 296, 10, 5, c.body2)];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 13; col++) {
        parts.push(rect(64 + col * 21, 122 + row * 19, 17, 14, 3, (row * 5 + col) % 9 === 0 ? c.accent : c.key));
      }
    }
    parts.push(rect(64, 198, 38, 12, 3, c.key), rect(106, 198, 168, 12, 3, c.key), rect(278, 198, 59, 12, 3, c.key));
    return parts;
  },
  // Top view: body, split buttons, scroll wheel, side grip.
  mouse: (c) => [
    rect(150, 70, 100, 170, 50, c.body),
    path2('M150 138 V120 A50 50 0 0 1 198 70 V138 Z', c.body2),
    path2('M250 138 V120 A50 50 0 0 0 202 70 V138 Z', c.body2),
    rect(192, 92, 16, 36, 8, c.accent),
    rect(146, 150, 8, 44, 4, c.body2),
    rect(186, 210, 28, 5, 2.5, c.body2),
  ],
  // Watch: strap, case, crown, face with activity ring and hands.
  watches: (c) => [
    path2('M166 96 L172 30 H228 L234 96 Z', c.body2),
    path2('M166 204 L172 262 H228 L234 204 Z', c.body2),
    rect(188, 240, 24, 5, 2.5, c.body),
    rect(146, 84, 108, 132, 30, c.body),
    rect(155, 93, 90, 114, 22, '#1d2129'),
    ring(200, 150, 34, '#3a414d', 7),
    `<path d="M200 116 A34 34 0 1 1 168 162" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
    line(200, 150, 200, 130, '#ffffff', 4),
    line(200, 150, 214, 158, '#ffffff', 4),
    circle(200, 150, 3.5, c.accent),
    rect(254, 134, 8, 26, 4, c.body2),
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
