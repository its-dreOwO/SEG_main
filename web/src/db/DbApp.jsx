import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { useApi, useTitle } from '../hooks.js';
import { DbCtx } from './ui.jsx';
import Products from './Products.jsx';
import ProductDetail from './ProductDetail.jsx';
import SearchLog from './SearchLog.jsx';
import SearchQuality from './SearchQuality.jsx';
import './db.css';

const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'));

export default function DbApp() {
  const { t } = useT();
  const { user, loading } = useAuth();
  const loc = useLocation();
  const [perms, setPerms] = useState(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  useTitle(t('d.title'));

  useEffect(() => {
    setPerms(null); setFailed(false); setDenied(false);
    if (!user) return undefined;
    let dead = false;
    api('/me').then((m) => { if (!dead) setPerms(m.permissions || []); }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [user]);

  const ctx = useMemo(() => ({ deny: () => setDenied(true) }), []);

  if (loading) return <Boot text={t('d.checking')} />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (failed) return <NoAccess name={user.display_name} error />;
  if (!perms) return <Boot text={t('d.checking')} />;
  if (denied || !perms.includes('db.view')) return <NoAccess name={user.display_name} />;

  return (
    <DbCtx.Provider value={ctx}>
      <Shell user={user} />
    </DbCtx.Provider>
  );
}

function Boot({ text }) {
  return <div className="dbx dbx-boot"><p className="dbx-dim" role="status">{text}</p></div>;
}

function Shell({ user }) {
  const { t, lang, setLang } = useT();
  const { logout } = useAuth();
  const { data: sum } = useApi('/db/summary');
  const stats = [
    [t('d.sumProducts'), sum?.products],
    [t('d.sumUnits'), sum?.units],
    [t('d.sumComments'), sum?.comments],
    [t('d.sumLog'), sum?.log_rows],
  ];
  return (
    <div className="dbx">
      <a className="skip-link" href="#dbx-main">{t('d.skip')}</a>
      <header className="dbx-top">
        <div className="dbx-top__row">
          <Link to="/db" className="dbx-brand">Volt<span>{t('d.brandLabel')}</span></Link>
          <dl className="dbx-stats">
            {stats.map(([label, v]) => (
              <div key={label}><dd>{num(v)}</dd><dt>{label}</dt></div>
            ))}
          </dl>
          <div className="dbx-top__right">
            <div className="dbx-lang" role="group" aria-label={t('lang.label')}>
              <button type="button" className={lang === 'en' ? 'is-on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              <button type="button" className={lang === 'vi' ? 'is-on' : ''} aria-pressed={lang === 'vi'} onClick={() => setLang('vi')}>VI</button>
            </div>
            <span className="dbx-user" title={user.email}>{user.display_name}</span>
            <Link to="/" className="dbx-link">{t('d.viewShop')}</Link>
            <button type="button" className="dbx-link" onClick={logout}>{t('auth.logout')}</button>
          </div>
        </div>
        <nav className="dbx-tabs" aria-label={t('d.nav')}>
          <NavLink to="/db" end className={({ isActive }) => (isActive ? 'is-on' : '')}>{t('d.tabProducts')}</NavLink>
          <NavLink to="/db/search-log" className={({ isActive }) => (isActive ? 'is-on' : '')}>{t('d.tabLog')}</NavLink>
          <NavLink to="/db/search-quality" className={({ isActive }) => (isActive ? 'is-on' : '')}>{t('d.tabQuality')}</NavLink>
          <span className="dbx-ro">{t('d.readOnly')}</span>
        </nav>
      </header>
      <main className="dbx-main" id="dbx-main" tabIndex={-1}>
        <Routes>
          <Route index element={<Products />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="search-log" element={<SearchLog />} />
          <Route path="search-quality" element={<SearchQuality />} />
          <Route path="*" element={<Navigate to="/db" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NoAccess({ name, error }) {
  const { t } = useT();
  const { logout } = useAuth();
  return (
    <div className="dbx dbx-boot">
      <div className="dbx-noaccess">
        <p className="dbx-brand">Volt<span>{t('d.brandLabel')}</span></p>
        <h1>{t('d.noAccessTitle')}</h1>
        <p>{error ? t('common.errorText') : t('d.noAccessText', { name })}</p>
        <div className="dbx-noaccess__act">
          <Link to="/" className="dbx-btn dbx-btn--solid">{t('d.toShop')}</Link>
          <button type="button" className="dbx-btn" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </div>
    </div>
  );
}
