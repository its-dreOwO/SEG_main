import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';
import Users from './Users.jsx';
import Roles from './Roles.jsx';
import Logs from './Logs.jsx';
import Settings from './Settings.jsx';
import Content, { DocForm } from './Content.jsx';
import Taxonomy from './Taxonomy.jsx';
import Moderation from './Moderation.jsx';
import Seo from './Seo.jsx';
import Analytics from './Analytics.jsx';
import './admin.css';

const SECTIONS = [
  { path: 'users', perm: 'users.manage', label: 'a.nav.users', El: Users },
  { path: 'roles', perm: 'roles.manage', label: 'a.nav.roles', El: Roles },
  { path: 'logs', perm: 'logs.view', label: 'a.nav.logs', El: Logs },
  { path: 'settings', perm: 'settings.manage', label: 'a.nav.settings', El: Settings },
  { path: 'content', perm: 'content.manage', label: 'a.nav.content', El: Content },
  { path: 'taxonomy', perm: 'taxonomy.manage', label: 'a.nav.taxonomy', El: Taxonomy },
  { path: 'moderation', perm: 'moderation.manage', label: 'a.nav.moderation', El: Moderation },
  { path: 'seo', perm: 'seo.manage', label: 'a.nav.seo', El: Seo },
  { path: 'analytics', perm: 'analytics.view', label: 'a.nav.analytics', El: Analytics },
];

export default function AdminApp() {
  const { t, lang, setLang } = useT();
  const { user, loading, logout } = useAuth();
  const loc = useLocation();
  const [perms, setPerms] = useState(null);
  const [failed, setFailed] = useState(false);
  useTitle(t('a.title'));

  useEffect(() => {
    if (!user) return;
    api('/me').then((m) => setPerms(m.permissions || [])).catch(() => setFailed(true));
  }, [user]);

  if (loading) return <p className="adm-center muted">{t('common.loading')}...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (failed) return <NoAccess msg={t('common.errorText')} />;
  if (!perms) return <p className="adm-center muted">{t('common.loading')}...</p>;

  const allowed = SECTIONS.filter((s) => perms.includes(s.perm));
  if (!allowed.length) return <NoAccess />;

  return (
    <div className="adm">
      <header className="adm-top">
        <Link to="/admin" className="adm-brand">Volt <span>{t('a.admin')}</span></Link>
        <div className="adm-top__right">
          <div className="lang" role="group" aria-label={t('lang.label')}>
            <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')}>EN</button>
            <button type="button" className={lang === 'vi' ? 'is-on' : ''} onClick={() => setLang('vi')}>VI</button>
          </div>
          <span className="adm-user" title={user.email}>{user.display_name}</span>
          <Link to="/" className="adm-toplink">{t('a.viewShop')}</Link>
          <button type="button" className="adm-toplink adm-toplink--btn" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </header>
      <div className="adm-body">
        <nav className="adm-nav" aria-label={t('a.navLabel')}>
          {allowed.map((s) => (
            <NavLink key={s.path} to={`/admin/${s.path}`} className={({ isActive }) => (isActive ? 'is-on' : '')}>{t(s.label)}</NavLink>
          ))}
        </nav>
        <main className="adm-main" id="main" tabIndex={-1}>
          <Routes>
            {allowed.map((s) => <Route key={s.path} path={`${s.path}`} element={<s.El />} />)}
            {perms.includes('content.manage') && <Route path="content/new" element={<DocForm />} />}
            {perms.includes('content.manage') && <Route path="content/:id" element={<DocForm />} />}
            <Route index element={<Navigate to={`/admin/${allowed[0].path}`} replace />} />
            <Route path="*" element={<Navigate to={`/admin/${allowed[0].path}`} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function NoAccess({ msg }) {
  const { t } = useT();
  return (
    <div className="container page page--narrow center">
      <p className="eyebrow">{t('a.admin')}</p>
      <h1>{t('a.noAccessTitle')}</h1>
      <p>{msg || t('a.noAccessText')}</p>
      <p><Link to="/" className="btn btn--accent">{t('notfound.home')}</Link></p>
    </div>
  );
}
