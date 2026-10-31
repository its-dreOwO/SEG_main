import { useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { ConfirmButton, PageHead, Scroll, Status, useFlash } from './ui.jsx';

function Manager({ kind, withVi }) {
  const { t } = useT();
  const base = kind === 'category' ? '/admin/categories' : '/admin/tags';
  const { data, loading, error, reload } = useApi(base);
  const [edit, setEdit] = useState(null); // {id|null, name, name_vi}
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  const save = async (e) => {
    e.preventDefault();
    if (!edit.name.trim()) { flash.fail({ message: t('a.nameRequired') }); return; }
    setBusy(true); flash.clear();
    const body = withVi ? { name: edit.name, name_vi: edit.name_vi || null } : { name: edit.name };
    try {
      await api(edit.id ? `${base}/${edit.id}` : base, { method: edit.id ? 'PUT' : 'POST', body });
      flash.ok(t('a.saved'));
      setEdit(null);
      reload();
    } catch (err) { flash.fail(err); } finally { setBusy(false); }
  };

  const del = async (row) => {
    flash.clear();
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      flash.ok(t('a.deleted'));
      reload();
    } catch (err) { flash.fail(err); }
  };

  return (
    <section className="adm-block">
      <PageHead title={t(kind === 'category' ? 'a.categories' : 'a.tagsTitle')}>
        <button type="button" className="btn btn--sm btn--accent" onClick={() => setEdit({ id: null, name: '', name_vi: '' })}>{t('a.new')}</button>
      </PageHead>
      {flash.node}
      {edit && (
        <form className="adm-inline" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor={`${kind}-name`}>{t('a.name')}</label>
            <input id={`${kind}-name`} value={edit.name} maxLength={100} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </div>
          {withVi && (
            <div className="field">
              <label htmlFor={`${kind}-vi`}>{t('a.name')} (VI)</label>
              <input id={`${kind}-vi`} value={edit.name_vi} maxLength={100} onChange={(e) => setEdit({ ...edit, name_vi: e.target.value })} />
            </div>
          )}
          <div className="adm-inline__btns">
            <button type="submit" className="btn btn--sm btn--accent" disabled={busy}>{t('a.save')}</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEdit(null)}>{t('a.cancel')}</button>
          </div>
        </form>
      )}
      <Status loading={loading} error={error} onRetry={reload} />
      {data && (
        <Scroll>
          <table className="adm-table">
            <thead><tr><th>{t('a.name')}</th>{withVi && <th>VI</th>}<th>Slug</th><th>{t('a.actions')}</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  {withVi && <td>{r.name_vi || '-'}</td>}
                  <td>{r.slug}</td>
                  <td className="nowrap adm-actions">
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEdit({ id: r.id, name: r.name, name_vi: r.name_vi || '' })}>{t('a.edit')}</button>
                    <ConfirmButton label={t('a.delete')} onConfirm={() => del(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      )}
    </section>
  );
}

export default function Taxonomy() {
  return (
    <>
      <Manager kind="category" withVi />
      <Manager kind="tag" />
    </>
  );
}
