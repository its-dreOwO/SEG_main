// USD is stored; VND is derived from a fixed rate and rounded to the nearest 1,000.
export function formatPrice(usd, lang, rate) {
  if (usd === null || usd === undefined || Number.isNaN(Number(usd))) return '';
  const n = Number(usd);
  if (lang === 'vi') {
    const vnd = Math.round((n * rate) / 1000) * 1000;
    return `${String(vnd).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
  }
  const [whole, frac] = n.toFixed(2).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

export function discountPercent(price, compareAt) {
  if (!compareAt || !price || compareAt <= price) return 0;
  return Math.round((1 - price / compareAt) * 100);
}
