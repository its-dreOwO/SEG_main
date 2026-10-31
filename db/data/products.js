// Product catalogue for the seed. Each category lives in db/data/products/<category>.js; this file joins them
// and builds the fields the documents table expects (HTML content, image path, SEO fields).
import { phones } from './products/phones.js';
import { headphones } from './products/headphones.js';
import { speakers } from './products/speakers.js';
import { laptops } from './products/laptops.js';
import { desktopPcs } from './products/desktop-pcs.js';
import { monitors } from './products/monitors.js';
import { keyboardsMice } from './products/keyboards-mice.js';
import { smartWatches } from './products/smart-watches.js';

const CATEGORY_NAMES = {
  phones: 'Phones',
  headphones: 'Headphones',
  speakers: 'Speakers',
  laptops: 'Laptops',
  'desktop-pcs': 'Desktop PCs',
  monitors: 'Monitors',
  'keyboards-mice': 'Keyboards & Mice',
  'smart-watches': 'Smart Watches',
};

// Staff display names that exist in db/data/users.js.
const AUTHORS = ['Casey Content', 'Sam SEO'];

const groups = [
  ['phones', phones],
  ['headphones', headphones],
  ['speakers', speakers],
  ['laptops', laptops],
  ['desktop-pcs', desktopPcs],
  ['monitors', monitors],
  ['keyboards-mice', keyboardsMice],
  ['smart-watches', smartWatches],
];

export function buildContent(paras, specs) {
  return `${paras.map((p) => `<p>${p}</p>`).join('')}<ul>${specs.map((s) => `<li>${s}</li>`).join('')}</ul>`;
}

export const products = groups.flatMap(([category, items]) =>
  items.map((p, i) => ({
    kind: 'product',
    slug: p.slug,
    title: p.title,
    title_vi: p.title_vi,
    summary: p.summary,
    summary_vi: p.summary_vi,
    content: buildContent(p.paras, p.specs),
    category,
    brand: p.brand,
    price: p.price,
    compare_at_price: p.compare_at_price,
    stock: p.stock,
    tags: p.tags,
    author: AUTHORS[i % AUTHORS.length],
    status: 'published',
    image: `/img/products/${p.slug}.svg`,
    image_alt: `${p.title} product illustration`,
    seo_title: p.seo_title,
    seo_description: p.summary,
    seo_keywords: [p.brand, CATEGORY_NAMES[category], ...p.tags].join(', '),
    mouse: p.mouse === true,
  })),
);

export { CATEGORY_NAMES };
