import { describe, it, expect } from 'vitest';
import { formatPrice, discountPercent } from '../money.js';
import { en, vi } from '../locales.js';

describe('formatPrice', () => {
  it('formats USD', () => {
    expect(formatPrice(19.99, 'en', 25000)).toBe('$19.99');
    expect(formatPrice(1299, 'en', 25000)).toBe('$1,299.00');
  });
  it('formats VND rounded to the nearest 1,000', () => {
    expect(formatPrice(19.99, 'vi', 25000)).toBe('500.000 ₫');
    expect(formatPrice(699, 'vi', 25000)).toBe('17.475.000 ₫');
  });
  it('returns an empty string for missing prices', () => {
    expect(formatPrice(null, 'en', 25000)).toBe('');
  });
});

describe('discountPercent', () => {
  it('computes a rounded percentage', () => {
    expect(discountPercent(699, 799)).toBe(13);
    expect(discountPercent(10, null)).toBe(0);
  });
});

describe('locales', () => {
  it('has every English key in Vietnamese', () => {
    const missing = Object.keys(en).filter((k) => !(k in vi) || !String(vi[k]).trim());
    expect(missing).toEqual([]);
  });
  it('has no extra Vietnamese keys', () => {
    expect(Object.keys(vi).filter((k) => !(k in en))).toEqual([]);
  });
});
