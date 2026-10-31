import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'volt.cart';
const CartContext = createContext(null);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((i) => Number.isInteger(i?.docId) && Number.isInteger(i?.qty) && i.qty > 0) : [];
  } catch {
    return [];
  }
}

// A cart line keeps just what the cart and checkout screens need; the server re-prices on order.
const toLine = (p, qty) => ({
  docId: p.id, slug: p.slug, title: p.title, title_vi: p.title_vi || null, price: p.price,
  image_url: p.image_url, image_alt: p.image_alt, stock: p.stock, qty,
});

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setItems(load()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((product, qty = 1) => {
    setItems((cur) => {
      const found = cur.find((i) => i.docId === product.id);
      const cap = Math.max(product.stock ?? 1000, 0);
      if (found) {
        return cur.map((i) => (i.docId === product.id ? { ...toLine(product, Math.min(i.qty + qty, cap)) } : i));
      }
      return [...cur, toLine(product, Math.min(qty, cap) || 1)];
    });
  }, []);

  const remove = useCallback((docId) => setItems((cur) => cur.filter((i) => i.docId !== docId)), []);

  const setQty = useCallback((docId, qty) => {
    setItems((cur) => cur
      .map((i) => (i.docId === docId ? { ...i, qty: Math.max(1, Math.min(Math.floor(qty) || 1, i.stock || 1000)) } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    add,
    remove,
    setQty,
    clear,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((s, i) => s + Math.round(i.price * 100) * i.qty, 0) / 100,
  }), [items, add, remove, setQty, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
