// Tokeniser shared by the indexer and the query parser, so documents and queries are split the same way.
//
// Pipeline: strip HTML -> lowercase -> fold accents (Vietnamese included, đ -> d) -> split on anything that is
// not a letter or digit -> drop stopwords -> light English plural stemming.

// Common English function words plus frequent Vietnamese ones (written accent-folded, as they appear after folding).
// Kept short on purpose: product words like "pro", "max" or "air" must never be dropped.
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your',
  'va', 'cua', 'la', 'cac', 'nhung', 'mot', 'cho', 'voi', 'duoc', 'nay', 'trong', 'khi', 'thi', 'de',
]);

export function fold(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// headphones -> headphone, batteries -> battery, boxes -> box. Leaves short words and words ending in ss/us/is alone.
export function stem(word) {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (/(ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function tokenize(text) {
  if (text === null || text === undefined) return [];
  const plain = String(text).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  const out = [];
  for (const raw of fold(plain).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}
