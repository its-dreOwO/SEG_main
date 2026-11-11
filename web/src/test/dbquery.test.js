import { describe, it, expect } from 'vitest';
import { readProductFilters, writeProductFilters, readLogFilters, nextSort, sortState, queryLine, stockLevel } from '../db/query.js';
import { en, vi } from '../locales.js';

describe('db filters <-> URL', () => {
  it('round-trips and drops defaults', () => {
    const sp = new URLSearchParams('q=tai+nghe&tag=wireless&stock=low&sort=stock_asc&page=3');
    const f = readProductFilters(sp);
    expect(f).toMatchObject({ q: 'tai nghe', tag: 'wireless', stock: 'low', sort: 'stock_asc', page: 3 });
    expect(writeProductFilters(f).toString()).toBe('q=tai+nghe&tag=wireless&stock=low&sort=stock_asc&page=3');
    expect(writeProductFilters(readProductFilters(new URLSearchParams('stock=bogus&page=0'))).toString()).toBe('');
  });
  it('validates the log clicked filter', () => {
    expect(readLogFilters(new URLSearchParams('clicked=maybe')).clicked).toBe('');
    expect(readLogFilters(new URLSearchParams('clicked=no')).clicked).toBe('no');
  });
});

describe('sorting', () => {
  it('toggles stock and price, keeps one-way columns', () => {
    expect(nextSort('newest', 'stock')).toBe('stock_desc');
    expect(nextSort('stock_desc', 'stock')).toBe('stock_asc');
    expect(nextSort('stock_asc', 'stock')).toBe('stock_desc');
    expect(nextSort('newest', 'views')).toBe('views');
    expect(nextSort('views', 'views')).toBe('views');
    expect(nextSort('newest', 'title')).toBe('title');
  });
  it('reports aria-sort', () => {
    expect(sortState('price_asc', 'price')).toBe('ascending');
    expect(sortState('price_asc', 'stock')).toBe('none');
  });
});

describe('queryLine', () => {
  it('describes the real filters', () => {
    const f = { q: 'tai nghe', tag: 'wireless', category: '', stock: '', sort: 'stock_asc', page: 1 };
    expect(queryLine('products', f, 14)).toBe('products  where text ~ "tai nghe"  and tag = wireless  order by stock asc  →  14 rows');
  });
  it('handles unknown count, singular and the log', () => {
    expect(queryLine('search_log', { q: '', clicked: 'no' }, null)).toBe('search_log  where clicked = no  order by timestamp desc  →  ...');
    expect(queryLine('search_log', { q: '' }, 1)).toContain('1 row');
  });
});

describe('stockLevel', () => {
  it('classifies', () => {
    expect([0, 1, 10, 11].map(stockLevel)).toEqual(['out', 'low', 'low', 'in']);
  });
});

describe('db strings', () => {
  it('registers in both languages', () => {
    expect(en['d.tabProducts']).toBeTruthy();
    expect(vi['d.tabProducts']).toBeTruthy();
  });
});
