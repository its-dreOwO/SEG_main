import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { PageHead, Status, useFlash } from './ui.jsx';

export default function Settings() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi('/admin/settings');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); flash.clear();
    try {
      await api('/admin/settings', { method: 'PUT', body: form });
      flash.ok(t('a.saved'));
    } catch (err) { flash.fail(err); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title={t('a.nav.settings')} />
      {flash.node}
      <Status loading={loading} error={error} onRetry={reload} />
      {data && (
        <form className="adm-form" onSubmit={save}>
          {Object.keys(form).sort().map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`s-${k}`}>{k}</label>
              {k === 'comment_moderation' ? (
                <select id={`s-${k}`} value={form[k] === 'on' ? 'on' : 'off'} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              ) : (
                <input id={`s-${k}`} value={form[k] ?? ''} maxLength={500} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              )}
            </div>
          ))}
          <button type="submit" className="btn btn--accent" disabled={busy}>{busy ? t('common.wait') : t('a.save')}</button>
        </form>
      )}
    </>
  );
}
