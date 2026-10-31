import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { errText } from '../hooks.js';
import { useT } from '../i18n.jsx';
import Pagination from '../components/Pagination.jsx';

export const PAGE_SIZE = 12;

// Success / error banner state for saves. `ok(msg)` and `fail(err)` set it; `node` renders it (plain text only).
export function useFlash() {
  const { t } = useT();
  const [flash, setFlash] = useState(null);
  const ok = useCallback((msg) => setFlash({ type: 'ok', msg }), []);
  const fail = useCallback((e) => setFlash({ type: 'err', msg: errText(e, t) }), [t]);
  const clear = useCallback(() => setFlash(null), []);
  const node = flash ? (
    <div className={flash.type === 'ok' ? 'success' : 'alert'} role={flash.type === 'ok' ? 'status' : 'alert'}>
      {flash.msg}
    </div>
  ) : null;
  return { ok, fail, clear, node };
}

// Fetches every page of an admin list (the list endpoints have no search), so search and paging can run in the browser.
export function useAll(path) {
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const sep = path.includes('?') ? '&' : '?';
        let page = 1;
        let all = [];
        for (;;) {
          const r = await api(`${path}${sep}limit=100&page=${page}`);
          all = all.concat(r.items);
          if (page >= r.pages) break;
          page += 1;
        }
        if (!dead) setState({ items: all, loading: false, error: null });
      } catch (error) {
        if (!dead) setState({ items: [], loading: false, error });
      }
    })();
    return () => { dead = true; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const patch = useCallback((fn) => setState((s) => ({ ...s, items: fn(s.items) })), []);
  return { ...state, reload, patch };
}

// Client-side search + paging over a full list.
export function useSearchPage(items, textOf) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? items.filter((x) => textOf(x).toLowerCase().includes(needle)) : items;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  return {
    q, setQ: (v) => { setQ(v); setPage(1); },
    page: cur, pages, setPage, total: filtered.length,
    rows: filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE),
  };
}

export function SearchBox({ value, onChange }) {
  const { t } = useT();
  return (
    <div className="adm-search">
      <label className="sr-only" htmlFor="adm-q">{t('a.search')}</label>
      <input id="adm-q" type="search" value={value} placeholder={t('a.search')} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Pager({ page, pages, onChange }) {
  return <Pagination page={page} pages={pages} onChange={onChange} />;
}

export function Scroll({ children }) {
  return <div className="adm-scroll">{children}</div>;
}

export function Status({ loading, error, onRetry }) {
  const { t } = useT();
  if (loading) return <p className="muted" role="status">{t('common.loading')}...</p>;
  if (error) {
    return (
      <div className="alert" role="alert">
        <p>{errText(error, t)}</p>
        {onRetry && <button type="button" className="btn btn--sm btn--outline" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    );
  }
  return null;
}

// Button that asks "Sure?" before running a destructive action.
export function ConfirmButton({ label, onConfirm, disabled }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn btn--sm btn--ghost adm-danger" disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="adm-confirm" role="group" aria-label={t('a.confirm')}>
      <span>{t('a.confirm')}</span>
      <button type="button" className="btn btn--sm btn--accent" onClick={() => { setAsking(false); onConfirm(); }}>{t('a.yes')}</button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAsking(false)}>{t('a.no')}</button>
    </span>
  );
}

export function PageHead({ title, children }) {
  return (
    <div className="adm-head">
      <h1>{title}</h1>
      <div className="adm-head__tools">{children}</div>
    </div>
  );
}

export const fmtDate = (iso, lang) => new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
