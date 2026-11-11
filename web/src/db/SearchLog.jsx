import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';
import Pagination from '../components/Pagination.jsx';
import { Empty, ErrorBlock, QueryInput, Select, Skeleton, Time, useDb } from './ui.jsx';
import { queryLine, readLogFilters, writeLogFilters } from './query.js';

export default function SearchLog() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const f = readLogFilters(sp);
  useTitle(t('d.tabLog') + ' | ' + t('d.title'));
  const set = (patch, replace = false) => setSp(writeLogFilters({ ...f, page: 1, ...patch }), { replace });
  const { data, error, loading, reload } = useDb(`/db/search-log${qs({ q: f.q, clicked: f.clicked, page: f.page > 1 ? f.page : '' })}`);
  const filtered = Boolean(f.q || f.clicked);

  return (
    <>
      <QueryInput value={f.q} onCommit={(q) => set({ q }, true)} placeholder={t('d.searchLog')} readout={queryLine('search_log', f, data ? data.total : null)} />
      <div className="dbx-filters">
        <Select label={t('d.filterClicked')} value={f.clicked} onChange={(v) => set({ clicked: v })} all={t('d.allClicked')}
          opts={[['yes', t('d.clickedYes')], ['no', t('d.clickedNo')]]} />
        {filtered && <button type="button" className="dbx-btn dbx-btn--sm" onClick={() => setSp(new URLSearchParams())}>{t('d.clear')}</button>}
      </div>
      {error && error.status !== 401 && error.status !== 403 ? <ErrorBlock error={error} onRetry={reload} />
        : data && data.items.length === 0 ? <Empty title={t('d.emptyLog')} onClear={filtered ? () => setSp(new URLSearchParams()) : null} />
        : (
          <div className="dbx-scroll">
            <table className={`dbx-table ${loading && data ? 'is-busy' : ''}`}>
              <thead>
                <tr>
                  <th scope="col" className="num">{t('d.colLogId')}</th>
                  <th scope="col">{t('d.colTimestamp')}</th>
                  <th scope="col">{t('d.colUser')}</th>
                  <th scope="col">{t('d.colQuery')}</th>
                  <th scope="col" className="num">{t('d.colResults')}</th>
                  <th scope="col">{t('d.colClicked')}</th>
                </tr>
              </thead>
              {!data ? <Skeleton cols={6} /> : (
                <tbody key={`${f.q}-${f.clicked}-${f.page}`}>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="num">{r.id}</th>
                      <td className="nowrap"><Time iso={r.timestamp} /></td>
                      <td>{r.user_id == null ? <span className="dbx-dim">{t('d.guest')}</span> : <>{r.user_name}<span className="dbx-dim"> #{r.user_id}</span></>}</td>
                      <td className="dbx-qs">{r.query_string === '' ? <span className="dbx-dim">{t('d.emptyQuery')}</span> : r.query_string}</td>
                      <td className="num">{r.result_count == null ? <span className="dbx-dim">-</span> : r.result_count}</td>
                      <td>
                        {r.clicked_doc_id == null ? <span className="dbx-dim">{t('d.noClick')}</span> : (
                          <Link className="dbx-doc" to={`/db/product/${r.clicked_doc_id}`}><span className="dbx-dim">#{r.clicked_doc_id}</span> {r.clicked_title || ''}</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={(page) => { setSp(writeLogFilters({ ...f, page })); window.scrollTo(0, 0); }} />}
    </>
  );
}
