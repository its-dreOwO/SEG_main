import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { PageHead, Scroll, Status, useFlash } from './ui.jsx';

const PERMS = ['users.manage', 'roles.manage', 'logs.view', 'settings.manage', 'content.manage', 'taxonomy.manage', 'moderation.manage', 'seo.manage', 'analytics.view'];

export default function Roles() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi('/admin/roles');
  const [grid, setGrid] = useState({});
  const [dirty, setDirty] = useState({});
  const [busy, setBusy] = useState(null);
  const flash = useFlash();

  useEffect(() => {
    if (data) { setGrid(Object.fromEntries(data.map((r) => [r.id, r.permissions]))); setDirty({}); }
  }, [data]);

  const toggle = (id, code) => {
    setGrid((g) => ({ ...g, [id]: g[id].includes(code) ? g[id].filter((c) => c !== code) : [...g[id], code] }));
    setDirty((d) => ({ ...d, [id]: true }));
  };

  const save = async (role) => {
    setBusy(role.id); flash.clear();
    try {
      await api(`/admin/roles/${role.id}/permissions`, { method: 'PUT', body: { permissions: grid[role.id] } });
      setDirty((d) => ({ ...d, [role.id]: false }));
      flash.ok(t('a.savedRole', { role: role.name }));
    } catch (e) { flash.fail(e); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead title={t('a.nav.roles')} />
      <p className="hint">{t('a.rolesHint')}</p>
      {flash.node}
      <Status loading={loading} error={error} onRetry={reload} />
      {data && (
        <Scroll>
          <table className="adm-table adm-matrix">
            <thead>
              <tr><th>{t('a.permission')}</th>{data.map((r) => <th key={r.id} className="center">{r.name}</th>)}</tr>
            </thead>
            <tbody>
              {PERMS.map((code) => (
                <tr key={code}>
                  <th scope="row">{code}</th>
                  {data.map((r) => (
                    <td key={r.id} className="center">
                      <input type="checkbox" aria-label={`${r.name}: ${code}`} checked={(grid[r.id] || []).includes(code)} onChange={() => toggle(r.id, code)} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" />
                {data.map((r) => (
                  <td key={r.id} className="center">
                    <button type="button" className="btn btn--sm btn--accent" disabled={!dirty[r.id] || busy === r.id} onClick={() => save(r)}>{t('a.save')}</button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Scroll>
      )}
    </>
  );
}
