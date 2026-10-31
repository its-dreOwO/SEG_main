import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { PageHead, Pager, Scroll, SearchBox, Status, fmtDate, useAll, useFlash, useSearchPage } from './ui.jsx';

const ROLES = ['super_admin', 'content_manager', 'moderator', 'seo_specialist', 'customer'];

export default function Users() {
  const { t, lang } = useT();
  const { user: me } = useAuth();
  const { items, loading, error, reload, patch } = useAll('/admin/users');
  const view = useSearchPage(items, (u) => `${u.email} ${u.display_name} ${u.role}`);
  const flash = useFlash();
  const [busy, setBusy] = useState(null);

  const run = async (u, path, body, apply) => {
    setBusy(u.id); flash.clear();
    try {
      await api(`/admin/users/${u.id}/${path}`, { method: 'PATCH', body });
      patch((list) => list.map((x) => (x.id === u.id ? { ...x, ...apply } : x)));
      flash.ok(t('a.saved'));
    } catch (e) { flash.fail(e); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead title={t('a.nav.users')}><SearchBox value={view.q} onChange={view.setQ} /></PageHead>
      {flash.node}
      <Status loading={loading} error={error} onRetry={reload} />
      {!loading && !error && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.name')}</th><th>{t('a.email')}</th><th>{t('a.role')}</th><th>{t('a.status')}</th><th>{t('a.created')}</th><th /></tr></thead>
              <tbody>
                {view.rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.display_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <select aria-label={`${t('a.role')} ${u.email}`} value={u.role} disabled={busy === u.id || u.id === me.id}
                        onChange={(e) => run(u, 'role', { role: e.target.value }, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><span className={`adm-tag ${u.active ? 'adm-tag--ok' : ''}`}>{u.active ? t('a.active') : t('a.inactive')}</span></td>
                    <td className="nowrap">{fmtDate(u.created_at, lang)}</td>
                    <td className="nowrap">
                      <button type="button" className="btn btn--sm btn--ghost" disabled={busy === u.id || (u.id === me.id && u.active)}
                        onClick={() => run(u, 'active', { active: !u.active }, { active: !u.active })}>
                        {u.active ? t('a.deactivate') : t('a.activate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          {!view.rows.length && <p className="muted">{t('a.none')}</p>}
          <Pager page={view.page} pages={view.pages} onChange={view.setPage} />
        </>
      )}
    </>
  );
}
