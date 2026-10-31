import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { PageHead, Pager, Scroll, Status, fmtDate } from './ui.jsx';

export default function Logs() {
  const { t, lang } = useT();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(`/admin/logs?limit=25&page=${page}`);
  return (
    <>
      <PageHead title={t('a.nav.logs')} />
      <Status loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <Scroll>
            <table className="adm-table">
              <thead><tr><th>{t('a.when')}</th><th>{t('a.user')}</th><th>{t('a.action')}</th><th>{t('a.detail')}</th></tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{fmtDate(l.created_at, lang)}</td>
                    <td>{l.user_email || '-'}</td>
                    <td>{l.action}</td>
                    <td>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          {!data.items.length && <p className="muted">{t('a.none')}</p>}
          <Pager page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </>
  );
}
