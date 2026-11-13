import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';
import { ErrorBlock, QueryInput, Time, useDb } from './ui.jsx';

const RANKERS = ['bm25', 'tfidf', 'baseline'];
const METRICS = [['precision5', 'P@5'], ['precision', 'P@{k}'], ['recall', 'R@{k}'], ['mrr', 'MRR'], ['map', 'MAP@{k}'], ['ndcg', 'nDCG@{k}']];
const f3 = (x) => (x == null ? '-' : Number(x).toFixed(3));
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const num = (n) => Number(n).toLocaleString('en-US');

// Search engine report: inverted index stats, offline evaluation from click judgments, online click metrics,
// and a query explainer showing tokens, term weights and each ranker's top results.
export default function SearchQuality() {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  useTitle(t('d.tabQuality') + ' | ' + t('d.title'));
  const { data, error, reload } = useDb('/db/search-eval');

  return (
    <>
      <section className="dbx-sec" aria-labelledby="sq-explain-h">
        <h2 id="sq-explain-h">{t('d.sqExplain')}</h2>
        <QueryInput value={q} onCommit={(v) => setSp(v ? new URLSearchParams({ q: v }) : new URLSearchParams(), { replace: true })}
          placeholder={t('d.sqExplainHint')} readout={q ? `tokenize("${q}") -> BM25 / TF-IDF / baseline` : t('d.sqExplainHint')} />
        {q && <Explain q={q} />}
      </section>

      {error && error.status !== 401 && error.status !== 403 ? <ErrorBlock error={error} onRetry={reload} />
        : !data ? <div className="dbx-facts-skel dbx-bar" aria-busy="true" />
        : <Report data={data} />}
    </>
  );
}

function Report({ data }) {
  const { t } = useT();
  const { index, offline, online } = data;
  const { k } = offline;
  const best = Object.fromEntries(METRICS.map(([m]) => [m, Math.max(...RANKERS.map((r) => offline.summary[r]?.[m] ?? 0))]));
  const maxClicks = Math.max(1, ...online.clicksByRank.map((r) => r.clicks));
  return (
    <>
      <section className="dbx-sec" aria-labelledby="sq-index-h">
        <h2 id="sq-index-h">{t('d.sqIndex')}</h2>
        <dl className="dbx-facts">
          <Fact k={t('d.sqDocs')} v={num(index.doc_count)} />
          <Fact k={t('d.sqTerms')} v={num(index.term_count)} />
          <Fact k={t('d.sqPostings')} v={num(index.postings)} />
          <Fact k={t('d.sqAvgLen')} v={index.avgdl} />
          <Fact k={t('d.sqBuilt')} v={index.built_at ? <Time iso={index.built_at} /> : '-'} />
        </dl>
      </section>

      <section className="dbx-sec" aria-labelledby="sq-off-h">
        <h2 id="sq-off-h">{t('d.sqOffline')}<span className="dbx-dim">{t('d.sqOfflineN', { n: offline.queries })}</span></h2>
        <p className="dbx-note">{t('d.sqOfflineNote')}</p>
        <div className="dbx-scroll">
          <table className="dbx-table dbx-table--metrics">
            <thead>
              <tr>
                <th scope="col">{t('d.sqRanker')}</th>
                {METRICS.map(([m, label]) => <th key={m} scope="col" className="num">{label.replace('{k}', k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {RANKERS.map((r) => (
                <tr key={r}>
                  <th scope="row">{t(`d.sqR.${r}`)}</th>
                  {METRICS.map(([m]) => {
                    const v = offline.summary[r][m];
                    return <td key={m} className={`num ${v === best[m] && v > 0 ? 'dbx-best' : ''}`}>{f3(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dbx-sec" aria-labelledby="sq-on-h">
        <h2 id="sq-on-h">{t('d.sqOnline')}</h2>
        <p className="dbx-note">{t('d.sqOnlineNote')}</p>
        <dl className="dbx-facts">
          <Fact k={t('d.sqSearches')} v={num(online.searches)} />
          <Fact k={t('d.sqZero')} v={pct(online.zeroResultRate)} />
          <Fact k={t('d.sqCtr')} v={pct(online.clickThroughRate)} />
          <Fact k={t('d.sqMrr')} v={f3(online.mrr)} />
          <Fact k={t('d.sqMeanRank')} v={online.meanClickedRank.toFixed(2)} />
          <Fact k={t('d.sqTop3')} v={pct(online.top3Share)} />
        </dl>
        {online.clicksByRank.length > 0 && (
          <table className="dbx-table dbx-table--ranks" aria-label={t('d.sqByRank')}>
            <thead><tr><th scope="col" className="num">{t('d.sqRank')}</th><th scope="col" className="num">{t('d.sqClicks')}</th><th scope="col"><span className="sr-only">{t('d.sqByRank')}</span></th></tr></thead>
            <tbody>
              {online.clicksByRank.map((r) => (
                <tr key={r.rank}>
                  <th scope="row" className="num">{r.rank}</th>
                  <td className="num">{r.clicks}</td>
                  <td className="dbx-rankbar"><span style={{ width: `${(r.clicks / maxClicks) * 100}%` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="dbx-sec" aria-labelledby="sq-q-h">
        <h2 id="sq-q-h">{t('d.sqPerQuery')}</h2>
        <div className="dbx-scroll">
          <table className="dbx-table">
            <thead>
              <tr>
                <th scope="col">{t('d.colQuery')}</th>
                <th scope="col" className="num">{t('d.sqRelevant')}</th>
                {RANKERS.map((r) => <th key={r} scope="col" className="num">nDCG@{k} {t(`d.sqR.${r}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {offline.perQuery.map((row) => {
                const top = Math.max(...RANKERS.map((r) => row.rankers[r].ndcg));
                return (
                  <tr key={row.query}>
                    <td className="dbx-qs"><Link to={`/db/search-quality${qs({ q: row.query })}`} onClick={() => window.scrollTo(0, 0)}>{row.query}</Link></td>
                    <td className="num">{row.relevant}</td>
                    {RANKERS.map((r) => (
                      <td key={r} className={`num ${row.rankers[r].ndcg === top && top > 0 ? 'dbx-best' : ''}`}>{row.rankers[r].ndcg.toFixed(2)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Explain({ q }) {
  const { t } = useT();
  const { data, error, reload } = useDb(`/db/search-explain${qs({ q })}`);
  if (error && error.status !== 401 && error.status !== 403) return <ErrorBlock error={error} onRetry={reload} />;
  if (!data) return <div className="dbx-facts-skel dbx-bar" aria-busy="true" />;
  return (
    <div className="dbx-explain">
      <p className="dbx-explain__line">
        <span className="dbx-dim">{t('d.sqTokens')}</span>{' '}
        {data.tokens.length ? <span className="dbx-chips">{data.tokens.map((x, i) => <span key={i} className="dbx-chip">{x}</span>)}</span>
          : <span className="dbx-dim">{t('d.sqNoTokens')}</span>}
      </p>
      {data.terms.length > 0 && (
        <table className="dbx-table dbx-table--terms">
          <thead>
            <tr>
              <th scope="col">{t('d.sqTerm')}</th>
              <th scope="col">{t('d.sqFrom')}</th>
              <th scope="col" className="num">df</th>
              <th scope="col" className="num">idf</th>
            </tr>
          </thead>
          <tbody>
            {data.terms.map((x) => (
              <tr key={x.term}>
                <td className="dbx-qs">{x.term}</td>
                <td className="dbx-qs dbx-dim">{x.from === x.term ? '=' : `${x.from}*`}</td>
                <td className="num">{x.df}</td>
                <td className="num">{f3(x.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dbx-explain__cols">
        {RANKERS.map((r) => (
          <div key={r}>
            <h3>{t(`d.sqR.${r}`)}</h3>
            {data.rankers[r].length === 0 ? <p className="dbx-dim">{t('d.sqNoResults')}</p> : (
              <ol>
                {data.rankers[r].map((d) => (
                  <li key={d.id}>
                    <Link className="dbx-doc" to={`/db/product/${d.id}`}>{d.title}</Link>
                    {d.score != null && <span className="dbx-dim"> {f3(d.score)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({ k, v }) {
  return <div className="dbx-fact"><dt>{k}</dt><dd>{v}</dd></div>;
}
