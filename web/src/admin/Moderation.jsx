import { useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { PageHead, Pager, Scroll, Status, fmtDate, useFlash } from './ui.jsx';

const STATUSES = ['pending', 'visible', 'hidden', 'spam'];

function Comments({ flash }) {
  const { t, lang } = useT();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(`/admin/comments?status=${status}&limit=10&page=${page}`);
  const [busy, setBusy] = useState(null);

  const act = async (c, next) => {
    setBusy(c.id); flash.clear();
    try {
      if (next === 'spam') await api(`/admin/comments/${c.id}/spam`, { method: 'POST' });
      else await api(`/admin/comments/${c.id}`, { method: 'PATCH', body: { status: next } });
      flash.ok(t('a.commentMarked', { status: next }));
      reload();
    } catch (e) { flash.fail(e); } finally { setBusy(null); }
  };

  return (
    <section className="adm-block">
      <PageHead title={t('a.queue')}>
        <select aria-label={t('a.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </PageHead>
      <Status loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.comment')}</th><th>{t('a.author')}</th><th>{t('a.on')}</th><th>{t('a.when')}</th><th>{t('a.actions')}</th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="wide cmt">{c.body}</td>
                    <td>{c.author}</td>
                    <td>{c.document_title}</td>
                    <td className="nowrap">{fmtDate(c.created_at, lang)}</td>
                    <td className="nowrap adm-actions">
                      {c.status !== 'visible' && <button type="button" className="btn btn--sm btn--ghost" disabled={busy === c.id} onClick={() => act(c, 'visible')}>{t('a.approve')}</button>}
                      {c.status !== 'hidden' && <button type="button" className="btn btn--sm btn--ghost" disabled={busy === c.id} onClick={() => act(c, 'hidden')}>{t('a.hide')}</button>}
                      {c.status !== 'spam' && <button type="button" className="btn btn--sm btn--ghost" disabled={busy === c.id} onClick={() => act(c, 'spam')}>{t('a.spam')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          {!data.items.length && <p className="muted">{t('a.queueEmpty')}</p>}
          <Pager page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

function Flags({ flash }) {
  const { t, lang } = useT();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(`/admin/flags?limit=10&page=${page}`);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const resolve = async (e) => {
    e.preventDefault();
    if (!note.trim()) { flash.fail({ message: t('a.resolutionRequired') }); return; }
    setBusy(true); flash.clear();
    try {
      await api(`/admin/flags/${open}/resolve`, { method: 'POST', body: { resolution: note.trim() } });
      flash.ok(t('a.resolved'));
      setOpen(null); setNote('');
      reload();
    } catch (err) { flash.fail(err); } finally { setBusy(false); }
  };

  return (
    <section className="adm-block">
      <PageHead title={t('a.flags')} />
      <Status loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.comment')}</th><th>{t('a.reason')}</th><th>{t('a.when')}</th><th>{t('a.actions')}</th></tr></thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id}>
                    <td className="wide cmt">{f.comment_body} <span className="adm-tag">{f.comment_status}</span></td>
                    <td>{f.reason}</td>
                    <td className="nowrap">{fmtDate(f.created_at, lang)}</td>
                    <td className="nowrap">
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setOpen(f.id); setNote(''); }}>{t('a.resolve')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          {!data.items.length && <p className="muted">{t('a.flagsEmpty')}</p>}
          <Pager page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
      {open && (
        <form className="adm-inline" onSubmit={resolve} noValidate>
          <div className="field">
            <label htmlFor="flag-note">{t('a.resolution')}</label>
            <input id="flag-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="adm-inline__btns">
            <button type="submit" className="btn btn--sm btn--accent" disabled={busy}>{t('a.resolve')}</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(null)}>{t('a.cancel')}</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Moderation() {
  const { t } = useT();
  const flash = useFlash();
  return (
    <>
      <PageHead title={t('a.nav.moderation')} />
      {flash.node}
      <Comments flash={flash} />
      <Flags flash={flash} />
    </>
  );
}
