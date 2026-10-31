import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { en, vi } from './locales.js';
import { formatPrice } from './money.js';

const DICTS = { en, vi };
const STORAGE_KEY = 'volt.lang';
const I18nContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch { /* storage unavailable */ }
  return 'en';
}

// Holds language choice (English/USD or Vietnamese/VND), public settings and the category list.
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const [settings, setSettings] = useState({ vndRate: 25000, banner: '', storeName: 'Volt' });
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    api('/settings/public').then(setSettings).catch(() => {});
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => {
    const dict = DICTS[lang];
    const t = (key, vars) => {
      let s = dict[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    };
    // Vietnamese field with English fallback, e.g. pick(doc, 'title') reads title_vi in Vietnamese.
    const pick = (doc, field) => {
      if (!doc) return '';
      if (lang === 'vi' && doc[`${field}_vi`]) return doc[`${field}_vi`];
      return doc[field] ?? '';
    };
    const price = (usd) => formatPrice(usd, lang, settings.vndRate);
    const date = (iso) => new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const catName = (slug, fallback = '') => {
      const c = categories.find((x) => x.slug === slug);
      return c ? pick(c, 'name') : fallback;
    };
    return { lang, setLang, t, pick, price, date, catName, categories, settings };
  }, [lang, setLang, settings, categories]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx;
}
