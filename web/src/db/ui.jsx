import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi, errText } from '../hooks.js';
import { useT } from '../i18n.jsx';
import { stockLevel, formatDateTime } from './query.js';

// Lets any screen report a 403 so the shell can swap to the "no access" view.
export const DbCtx = createContext({ deny: () => {} });

// GET wrapper: 401 sends the user to login (returning here), 403 shows the no-access screen.
export function useDb(path) {
  const res = useApi(path);
  const { deny } = useContext(DbCtx);
  const navigate = useNavigate();
  const loc = useLocation();
  const status = res.error?.status;
  useEffect(() => {
    if (status === 401) navigate('/login', { replace: true, state: { from: loc.pathname + loc.search } });
    if (status === 403) deny();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  return res;
}

export function Skeleton({ cols, rows = 8 }) {
  const { t } = useT();
  return (
    <tbody className="dbx-skel" aria-busy="true">
      <tr><td colSpan={cols} className="sr-only">{t('d.loadingRows')}</td></tr>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: cols }, (_, j) => <td key={j}><span className="dbx-bar" style={{ width: `${40 + ((i * 7 + j * 13) % 45)}%` }} /></td>)}
        </tr>
      ))}
    </tbody>
  );
}

export function ErrorBlock({ error, onRetry }) {
  const { t } = useT();
  return (
    <div className="dbx-state dbx-state--err" role="alert">
      <p className="dbx-state__title">{t('d.errTitle')}</p>
      <p className="dbx-state__text">{errText(error, t)}</p>
      <button type="button" className="dbx-btn" onClick={onRetry}>{t('d.retry')}</button>
    </div>
  );
}

export function Empty({ title, onClear }) {
  const { t } = useT();
  return (
    <div className="dbx-state">
      <p className="dbx-state__title">{title}</p>
      <p className="dbx-state__text">{t('d.emptyHint')}</p>
      {onClear && <button type="button" className="dbx-btn" onClick={onClear}>{t('d.clear')}</button>}
    </div>
  );
}

// Stock number plus a 3-segment bar: out lights none, low one, in all three.
export function Stock({ n }) {
  const { t } = useT();
  const lv = stockLevel(n);
  const lit = { out: 0, low: 1, in: 3 }[lv];
  const word = { out: t('d.stOut'), low: t('d.stLow'), in: t('d.stIn') }[lv];
  return (
    <span className={`dbx-stock dbx-stock--${lv}`}>
      <span className="dbx-stock__n">{n}</span>
      <span className="dbx-stock__bar" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < lit ? 'on' : ''} />)}</span>
      <span className="dbx-stock__w">{word}</span>
    </span>
  );
}

export function Time({ iso }) {
  const { lang } = useT();
  if (!iso) return <span className="dbx-dim">-</span>;
  return <time dateTime={iso} title={iso}>{formatDateTime(iso, lang)}</time>;
}

// Sortable column header; `state` is the aria-sort value.
export function SortTh({ col, state, label, onSort, num }) {
  const { t } = useT();
  const arrow = state === 'ascending' ? '↑' : state === 'descending' ? '↓' : '↕';
  return (
    <th scope="col" aria-sort={state} className={num ? 'num' : ''}>
      <button type="button" className={`dbx-sort ${state !== 'none' ? 'is-on' : ''}`} onClick={() => onSort(col)} aria-label={t('d.sortBy', { col: label })}>
        {label}<span aria-hidden="true">{arrow}</span>
      </button>
    </th>
  );
}

// The query line: a mono prompt, the input and a live read-out of the query being run.
// Typing commits after 300 ms; Enter commits at once; "/" focuses from anywhere.
export function QueryInput({ value, onCommit, placeholder, readout }) {
  const { t } = useT();
  const [text, setText] = useState(value);
  const ref = useRef(null);
  const timer = useRef(null);
  const last = useRef(value);

  // Follow external changes (clear filters, Back button).
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value); }
  }, [value]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer.current); };
  }, []);

  const commit = (v) => {
    clearTimeout(timer.current);
    const next = v.trim();
    if (next !== last.current) { last.current = next; onCommit(next); }
  };
  const change = (e) => {
    setText(e.target.value);
    clearTimeout(timer.current);
    const v = e.target.value;
    timer.current = setTimeout(() => commit(v), 300);
  };

  return (
    <form className="dbx-query" role="search" onSubmit={(e) => { e.preventDefault(); commit(text); }}>
      <label className="dbx-query__row" htmlFor="dbx-q">
        <span className="dbx-query__prompt" aria-hidden="true">{t('d.queryLabel')} &gt;</span>
        <span className="sr-only">{placeholder}</span>
        <input id="dbx-q" ref={ref} type="text" value={text} onChange={change} placeholder={placeholder} autoComplete="off" spellCheck="false" />
        <kbd className="dbx-query__key" title={t('d.searchHint')}>/</kbd>
      </label>
      <p className="dbx-readout" aria-live="polite">{readout}</p>
    </form>
  );
}

export function Select({ label, value, onChange, opts, all }) {
  return (
    <label className="dbx-sel">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== undefined && <option value="">{all}</option>}
        {opts.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}
