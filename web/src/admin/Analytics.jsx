import { useT } from '../i18n.jsx';
import { useApi } from '../hooks.js';
import { PageHead, Scroll, Status } from './ui.jsx';

function Tile({ label, value }) {
  return (
    <div className="adm-tile">
      <span className="adm-tile__label">{label}</span>
      <strong className="adm-tile__value">{value}</strong>
    </div>
  );
}

function Bars({ rows }) {
  const { t } = useT();
  if (!rows.length) return <p className="muted">{t('a.none')}</p>;
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <figure className="adm-chart">
      <div className="adm-bars" role="img" aria-label={t('a.viewsByDay')}>
        {rows.map((r) => (
          <div key={r.day} className="adm-bar" title={`${r.day}: ${r.views}`}>
            <span style={{ height: `${Math.max(2, (r.views / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="adm-axis">
        <span>{rows[0].day}</span>
        <span>{t('a.peak', { n: max })}</span>
        <span>{rows[rows.length - 1].day}</span>
      </figcaption>
    </figure>
  );
}

function CountTable({ rows, head }) {
  const { t } = useT();
  return (
    <Scroll>
      <table className="adm-table">
        <thead><tr><th>{head}</th><th className="num">{t('a.count')}</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.query}><td className="wide">{r.query}</td><td className="num">{r.count}</td></tr>)}
          {!rows.length && <tr><td colSpan={2} className="muted">{t('a.none')}</td></tr>}
        </tbody>
      </table>
    </Scroll>
  );
}

export default function Analytics() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi('/admin/analytics');
  return (
    <>
      <PageHead title={t('a.nav.analytics')} />
      <Status loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <div className="adm-tiles">
            <Tile label={t('a.tDocs')} value={data.totals.documents} />
            <Tile label={t('a.tPublished')} value={data.totals.published} />
            <Tile label={t('a.tUsers')} value={data.totals.users} />
            <Tile label={t('a.tOrders')} value={data.totals.orders} />
            <Tile label={t('a.tRevenue')} value={`$${data.totals.revenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
            <Tile label={t('a.tViews')} value={data.totals.views} />
            <Tile label={t('a.tSearches')} value={data.clickThrough.searches} />
            <Tile label={t('a.tCtr')} value={`${(data.clickThrough.rate * 100).toFixed(1)}%`} />
          </div>
          <section className="adm-block">
            <h2>{t('a.viewsByDay')}</h2>
            <Bars rows={data.viewsByDay} />
          </section>
          <div className="adm-grid2 adm-block">
            <section>
              <h2>{t('a.topViewed')}</h2>
              <Scroll>
                <table className="adm-table">
                  <thead><tr><th>{t('a.title2')}</th><th className="num">{t('a.tViews')}</th></tr></thead>
                  <tbody>
                    {data.topViewed.map((d) => <tr key={d.id}><td className="wide">{d.title}</td><td className="num">{d.views_count}</td></tr>)}
                  </tbody>
                </table>
              </Scroll>
            </section>
            <section>
              <h2>{t('a.ctr')}</h2>
              <p>{t('a.ctrText', { clicks: data.clickThrough.clicks, searches: data.clickThrough.searches, rate: (data.clickThrough.rate * 100).toFixed(1) })}</p>
            </section>
          </div>
          <div className="adm-grid2 adm-block">
            <section><h2>{t('a.topSearches')}</h2><CountTable rows={data.topSearches} head={t('a.query')} /></section>
            <section><h2>{t('a.zeroSearches')}</h2><CountTable rows={data.zeroResultSearches} head={t('a.query')} /></section>
          </div>
        </>
      )}
    </>
  );
}
