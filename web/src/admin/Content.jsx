import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { ConfirmButton, PageHead, Pager, Scroll, SearchBox, Status, useAll, useFlash, useSearchPage } from './ui.jsx';

export default function Content() {
  const { t } = useT();
  const { items, loading, error, reload, patch } = useAll('/admin/documents');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const filtered = items.filter((d) => (!kind || d.kind === kind) && (!status || d.status === status));
  const view = useSearchPage(filtered, (d) => `${d.title} ${d.slug}`);
  const flash = useFlash();
  const [busy, setBusy] = useState(null);

  const toggle = async (d) => {
    const next = d.status === 'published' ? 'draft' : 'published';
    setBusy(d.id); flash.clear();
    try {
      await api(`/admin/documents/${d.id}`, { method: 'PUT', body: { status: next } });
      patch((l) => l.map((x) => (x.id === d.id ? { ...x, status: next } : x)));
      flash.ok(next === 'published' ? t('a.published') : t('a.unpublished'));
    } catch (e) { flash.fail(e); } finally { setBusy(null); }
  };

  const del = async (d) => {
    setBusy(d.id); flash.clear();
    try {
      await api(`/admin/documents/${d.id}`, { method: 'DELETE' });
      patch((l) => l.filter((x) => x.id !== d.id));
      flash.ok(t('a.deleted'));
    } catch (e) { flash.fail(e); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead title={t('a.nav.content')}>
        <SearchBox value={view.q} onChange={view.setQ} />
        <Link to="/admin/content/new" className="btn btn--sm btn--accent">{t('a.new')}</Link>
      </PageHead>
      <div className="adm-filters">
        <select aria-label={t('a.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('a.allKinds')}</option>
          <option value="product">{t('a.product')}</option>
          <option value="article">{t('a.article')}</option>
        </select>
        <select aria-label={t('a.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('a.allStatus')}</option>
          <option value="published">{t('a.published')}</option>
          <option value="draft">{t('a.draft')}</option>
        </select>
      </div>
      {flash.node}
      <Status loading={loading} error={error} onRetry={reload} />
      {!loading && !error && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.title2')}</th><th>{t('a.kind')}</th><th>{t('a.price')}</th><th>{t('a.stock')}</th><th>{t('a.status')}</th><th>{t('a.actions')}</th></tr></thead>
              <tbody>
                {view.rows.map((d) => (
                  <tr key={d.id}>
                    <td className="wide"><Link className="link-accent" to={`/admin/content/${d.id}`}>{d.title}</Link></td>
                    <td>{d.kind}</td>
                    <td>{d.price == null ? '-' : d.price}</td>
                    <td>{d.kind === 'product' ? d.stock : '-'}</td>
                    <td><span className={`adm-tag ${d.status === 'published' ? 'adm-tag--ok' : ''}`}>{d.status}</span></td>
                    <td className="nowrap adm-actions">
                      <Link className="btn btn--sm btn--ghost" to={`/admin/content/${d.id}`}>{t('a.edit')}</Link>
                      <button type="button" className="btn btn--sm btn--ghost" disabled={busy === d.id} onClick={() => toggle(d)}>
                        {d.status === 'published' ? t('a.unpublish') : t('a.publish')}
                      </button>
                      <ConfirmButton label={t('a.delete')} disabled={busy === d.id} onConfirm={() => del(d)} />
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

const EMPTY = {
  kind: 'product', status: 'draft', title: '', title_vi: '', summary: '', summary_vi: '', content: '', content_vi: '',
  price: '', compare_at_price: '', stock: '0', brand: '', author: '', image_url: '', category_id: '', tags: '',
};

export function DocForm() {
  const { t } = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id;
  const { data, loading, error, reload } = useApi(isNew ? null : `/admin/documents/${id}`);
  const [cats, setCats] = useState([]);
  const { user } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  useEffect(() => {
    if (isNew && user) setF((s) => (s.author ? s : { ...s, author: user.display_name }));
  }, [isNew, user]);
  useEffect(() => { api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    if (!data) return;
    setF({
      kind: data.kind, status: data.status, title: data.title ?? '', title_vi: data.title_vi ?? '', summary: data.summary ?? '', summary_vi: data.summary_vi ?? '',
      content: data.content ?? '', content_vi: data.content_vi ?? '', price: data.price ?? '', compare_at_price: data.compare_at_price ?? '',
      stock: String(data.stock ?? 0), brand: data.brand ?? '', author: data.author ?? '', image_url: data.image_url ?? '', category_id: data.category_id ?? '', tags: (data.tags || []).join(', '),
    });
  }, [data]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isProduct = f.kind === 'product';

  const submit = async (e) => {
    e.preventDefault();
    flash.clear();
    if (!f.title.trim()) { flash.fail({ message: t('a.titleRequired') }); return; }
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const body = {
      kind: f.kind, status: f.status, title: f.title.trim(), title_vi: f.title_vi || null, summary: f.summary, summary_vi: f.summary_vi,
      content: f.content, content_vi: f.content_vi, author: f.author.trim() || null, image_url: f.image_url || null,
      category_id: f.category_id === '' ? null : Number(f.category_id),
      tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean),
    };
    if (isProduct && f.status === 'published' && (f.price === '' || f.price == null)) { flash.fail({ message: t('a.priceRequired') }); return; }
    if (isProduct) {
      body.price = num(f.price); body.compare_at_price = num(f.compare_at_price);
      body.stock = Number.parseInt(f.stock || '0', 10); body.brand = f.brand || null;
      if (!Number.isInteger(body.stock) || body.stock < 0) { flash.fail({ message: t('a.stockInvalid') }); return; }
    }
    setBusy(true);
    try {
      if (isNew) {
        const created = await api('/admin/documents', { method: 'POST', body });
        nav(`/admin/content/${created.id}`, { replace: true });
      } else {
        await api(`/admin/documents/${id}`, { method: 'PUT', body });
        flash.ok(t('a.saved'));
        reload();
      }
    } catch (err) { flash.fail(err); } finally { setBusy(false); }
  };

  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} value={f[k]} onChange={set(k)} {...props} />
    </div>
  );
  const area = (k, label, rows = 4) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <textarea id={`f-${k}`} rows={rows} value={f[k]} onChange={set(k)} />
    </div>
  );

  return (
    <>
      <PageHead title={isNew ? t('a.newDoc') : t('a.editDoc')}>
        <Link to="/admin/content" className="btn btn--sm btn--ghost">{t('a.back')}</Link>
      </PageHead>
      {flash.node}
      <Status loading={loading} error={error} onRetry={reload} />
      {(isNew || data) && (
        <form className="adm-form adm-form--wide" onSubmit={submit} noValidate>
          <div className="adm-grid2">
            <div className="field">
              <label htmlFor="f-kind">{t('a.kind')}</label>
              <select id="f-kind" value={f.kind} onChange={set('kind')}>
                <option value="product">{t('a.product')}</option>
                <option value="article">{t('a.article')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-status">{t('a.status')}</label>
              <select id="f-status" value={f.status} onChange={set('status')}>
                <option value="draft">{t('a.draft')}</option>
                <option value="published">{t('a.published')}</option>
              </select>
            </div>
          </div>
          <div className="adm-grid2">
            {field('title', `${t('a.title2')} (EN)`, { required: true, maxLength: 300 })}
            {field('title_vi', `${t('a.title2')} (VI)`, { maxLength: 300 })}
          </div>
          <div className="adm-grid2">
            {area('summary', `${t('a.summary')} (EN)`, 3)}
            {area('summary_vi', `${t('a.summary')} (VI)`, 3)}
          </div>
          <div className="adm-grid2">
            {area('content', `${t('a.content')} (EN)`, 8)}
            {area('content_vi', `${t('a.content')} (VI)`, 8)}
          </div>
          {isProduct && (
            <div className="adm-grid3">
              {field('price', t('a.price'), { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
              {field('compare_at_price', t('a.comparePrice'), { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
              {field('stock', t('a.stock'), { type: 'number', min: 0, step: 1 })}
            </div>
          )}
          <div className="adm-grid2">
            {isProduct && field('brand', t('a.brand'), { maxLength: 100 })}
            <div className="field">
              <label htmlFor="f-category_id">{t('a.category')}</label>
              <select id="f-category_id" value={f.category_id} onChange={set('category_id')}>
                <option value="">-</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {field('author', t('a.author'), { maxLength: 100 })}
          {field('image_url', t('a.imageUrl'), { placeholder: '/img/products/example.svg' })}
          {field('tags', t('a.tags'))}
          <p className="hint">{t('a.tagsHint')}</p>
          <button type="submit" className="btn btn--accent" disabled={busy}>{busy ? t('common.wait') : t('a.save')}</button>
        </form>
      )}
    </>
  );
}
