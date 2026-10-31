import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { PageHead, Pager, Scroll, SearchBox, Status, useAll, useFlash, useSearchPage } from './ui.jsx';

const FIELDS = ['seo_title', 'seo_description', 'seo_keywords', 'image_alt'];

export default function Seo() {
  const { t } = useT();
  const { items, loading, error, reload, patch } = useAll('/admin/seo');
  const view = useSearchPage(items, (d) => `${d.title} ${d.slug}`);
  const [sel, setSel] = useState(null);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  useEffect(() => {
    if (sel) setF(Object.fromEntries(FIELDS.map((k) => [k, sel[k] ?? ''])));
  }, [sel]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); flash.clear();
    try {
      const body = Object.fromEntries(FIELDS.map((k) => [k, f[k] === '' ? null : f[k]]));
      const row = await api(`/admin/seo/${sel.id}`, { method: 'PUT', body });
      patch((l) => l.map((x) => (x.id === sel.id ? { ...x, ...row } : x)));
      setSel((s) => ({ ...s, ...row }));
      flash.ok(t('a.saved'));
    } catch (err) { flash.fail(err); } finally { setBusy(false); }
  };

  const lenHint = (k, max) => `${(f[k] || '').length}/${max}`;
  const input = (k, label, max, multi) => (
    <div className="field">
      <label htmlFor={`seo-${k}`}>{label} <span className="muted">{lenHint(k, max)}</span></label>
      {multi
        ? <textarea id={`seo-${k}`} rows={3} maxLength={500} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={`seo-${k}`} maxLength={500} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </div>
  );

  return (
    <>
      <PageHead title={t('a.nav.seo')}><SearchBox value={view.q} onChange={view.setQ} /></PageHead>
      {flash.node}
      {sel && (
        <form className="adm-form adm-block" onSubmit={save}>
          <h2>{sel.title}</h2>
          {input('seo_title', t('a.seoTitle'), 70)}
          {input('seo_description', t('a.seoDesc'), 160, true)}
          {input('seo_keywords', t('a.seoKeywords'), 200)}
          {input('image_alt', t('a.imageAlt'), 125)}
          <div className="row">
            <button type="submit" className="btn btn--accent" disabled={busy}>{busy ? t('common.wait') : t('a.save')}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setSel(null)}>{t('a.close')}</button>
          </div>
        </form>
      )}
      <Status loading={loading} error={error} onRetry={reload} />
      {!loading && !error && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.title2')}</th><th>{t('a.seoTitle')}</th><th>{t('a.seoDesc')}</th><th>{t('a.imageAlt')}</th><th /></tr></thead>
              <tbody>
                {view.rows.map((d) => (
                  <tr key={d.id} className={sel?.id === d.id ? 'is-sel' : ''}>
                    <td className="wide">{d.title}</td>
                    <td>{d.seo_title ? t('a.set') : <span className="muted">{t('a.missing')}</span>}</td>
                    <td>{d.seo_description ? t('a.set') : <span className="muted">{t('a.missing')}</span>}</td>
                    <td>{d.image_alt ? t('a.set') : <span className="muted">{t('a.missing')}</span>}</td>
                    <td><button type="button" className="btn btn--sm btn--ghost" onClick={() => { setSel(d); flash.clear(); window.scrollTo(0, 0); }}>{t('a.edit')}</button></td>
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
