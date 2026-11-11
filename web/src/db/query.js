// Pure helpers for the database dashboard: URL params <-> filters, sort toggling and the query read-out line.

export const SORT_DEFAULT = 'newest';
export const STOCKS = ['in', 'low', 'out'];
export const LOW_MAX = 10;

// Sortable columns -> the API sort values for ascending / descending (null where the API has no such order).
export const SORT_COLS = {
  title: { asc: 'title', desc: null },
  stock: { asc: 'stock_asc', desc: 'stock_desc' },
  price: { asc: 'price_asc', desc: 'price_desc' },
  views: { asc: null, desc: 'views' },
  comments: { asc: null, desc: 'comments' },
};

export function readProductFilters(sp) {
  const stock = sp.get('stock');
  const page = parseInt(sp.get('page'), 10);
  return {
    q: sp.get('q') || '',
    tag: sp.get('tag') || '',
    category: sp.get('category') || '',
    stock: STOCKS.includes(stock) ? stock : '',
    sort: sp.get('sort') || SORT_DEFAULT,
    page: page > 0 ? page : 1,
  };
}

// Writes only non-default values so URLs stay short. Returns URLSearchParams.
export function writeProductFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tag) p.set('tag', f.tag);
  if (f.category) p.set('category', f.category);
  if (f.stock) p.set('stock', f.stock);
  if (f.sort && f.sort !== SORT_DEFAULT) p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

export function readLogFilters(sp) {
  const clicked = sp.get('clicked');
  const page = parseInt(sp.get('page'), 10);
  return { q: sp.get('q') || '', clicked: clicked === 'yes' || clicked === 'no' ? clicked : '', page: page > 0 ? page : 1 };
}

export function writeLogFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.clicked) p.set('clicked', f.clicked);
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

// Next sort value after clicking a column header: unsorted -> first available direction, then flip where possible.
export function nextSort(current, col) {
  const c = SORT_COLS[col];
  if (!c) return current;
  // Numeric columns read best largest-first; the title column only goes A-Z.
  const first = col === 'title' ? c.asc : (c.desc || c.asc);
  if (current === c.desc && c.asc) return c.asc;
  if (current === c.asc && c.desc) return c.desc;
  return first;
}

// 'ascending' | 'descending' | 'none' for aria-sort.
export function sortState(current, col) {
  const c = SORT_COLS[col];
  if (!c) return 'none';
  if (current === c.asc) return 'ascending';
  if (current === c.desc) return 'descending';
  return 'none';
}

// Which column and direction a sort value means, e.g. 'stock_asc' -> ['stock','asc'].
export function sortParts(sort) {
  for (const [col, c] of Object.entries(SORT_COLS)) {
    if (sort === c.asc) return [col, 'asc'];
    if (sort === c.desc) return [col, 'desc'];
  }
  return ['created', 'desc'];
}

const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// Plain-text description of the query being run, built from the real filters.
// total === null means the count is not known yet.
export function queryLine(table, f, total) {
  const where = [];
  let order = '';
  if (table === 'products') {
    if (f.q) where.push(`text ~ ${quote(f.q)}`);
    if (f.tag) where.push(`tag = ${f.tag}`);
    if (f.category) where.push(`category = ${f.category}`);
    if (f.stock) where.push(`stock = ${f.stock}`);
    const [col, dir] = sortParts(f.sort);
    order = `order by ${col === 'created' ? 'created_at' : col} ${dir}`;
  } else {
    if (f.q) where.push(`query ~ ${quote(f.q)}`);
    if (f.clicked) where.push(`clicked = ${f.clicked}`);
    order = 'order by timestamp desc';
  }
  const parts = [table];
  if (where.length) parts.push(`where ${where.join('  and ')}`);
  parts.push(order);
  const rows = total === null || total === undefined ? '...' : `${total} ${total === 1 ? 'row' : 'rows'}`;
  return `${parts.join('  ')}  →  ${rows}`;
}

export function stockLevel(n) {
  if (!(n > 0)) return 'out';
  return n <= LOW_MAX ? 'low' : 'in';
}

export function activeFilterCount(f) {
  return ['q', 'tag', 'category', 'stock', 'clicked'].filter((k) => f[k]).length;
}

// Full date and time to the second in the user's locale; the ISO value stays in the element's dateTime/title.
export function formatDateTime(iso, lang) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}
