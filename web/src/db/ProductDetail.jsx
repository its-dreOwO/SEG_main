import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';
import Pagination from '../components/Pagination.jsx';
import { Empty, ErrorBlock, Skeleton, Stock, Time, useDb } from './ui.jsx';

export default function ProductDetail() {
  const { id } = useParams();
  const { t, price } = useT();
  const { data: p, error, reload } = useDb(`/db/products/${encodeURIComponent(id)}`);
  useTitle(p ? `#${p.id} ${p.title}` : t('d.title'));

  return (
    <>
      <p className="dbx-crumb"><Link to="/db">&larr; {t('d.back')}</Link></p>
      {error && error.status === 404 ? <Empty title={t('d.notFound')} />
        : error && error.status !== 401 && error.status !== 403 ? <ErrorBlock error={error} onRetry={reload} />
        : !p ? <div className="dbx-facts-skel dbx-bar" aria-busy="true" />
        : (
          <>
            <header className="dbx-dhead">
              <h1>{p.title}</h1>
              <span className={`dbx-status dbx-status--${p.status}`}>{p.status === 'published' ? t('d.published') : t('d.draft')}</span>
              {p.status === 'published' && <Link className="dbx-link dbx-dhead__shop" to={`/product/${p.slug}`}>{t('d.viewInShop')} &rarr;</Link>}
            </header>
            <dl className="dbx-facts">
              <Fact k={t('d.fId')} v={p.id} />
              <Fact k={t('d.fBrand')} v={p.brand || '-'} sans />
              <Fact k={t('d.fCategory')} v={p.category || '-'} sans />
              <Fact k={t('d.fPrice')} v={p.price === null ? '-' : price(p.price)} />
              <Fact k={t('d.fCompare')} v={p.compare_at_price ? price(p.compare_at_price) : '-'} />
              <Fact k={t('d.fStock')} v={<Stock n={p.stock} />} />
              <Fact k={t('d.fViews')} v={p.views_count.toLocaleString('en-US')} />
              <Fact k={t('d.fRating')} v={p.rating_avg === null || p.rating_avg === undefined ? t('d.noRating') : t('d.ratingOf', { avg: Number(p.rating_avg).toFixed(1), n: p.rating_count })} />
              <Fact k={t('d.fLikes')} v={p.like_count} />
              <Fact k={t('d.fComments')} v={`${p.comment_count} + ${p.reply_count}`} />
              <Fact k={t('d.fAuthor')} v={p.author || '-'} sans />
              <Fact k={t('d.fSlug')} v={p.slug} />
              <Fact k={t('d.fCreated')} v={<Time iso={p.created_at} />} />
              <Fact k={t('d.fUpdated')} v={<Time iso={p.updated_at} />} />
            </dl>

            <section className="dbx-sec" aria-labelledby="dbx-tags-h">
              <h2 id="dbx-tags-h">{t('d.tagsHeading')} <span className="dbx-dim">{p.tags.length}</span></h2>
              {p.tags.length === 0 ? <p className="dbx-dim">{t('d.noTags')}</p> : (
                <div className="dbx-scroll">
                  <table className="dbx-table dbx-table--tags">
                    <thead><tr><th scope="col">{t('d.tagName')}</th><th scope="col">{t('d.tagBy')}</th><th scope="col">{t('d.tagAt')}</th></tr></thead>
                    <tbody>
                      {p.tags.map((tg) => (
                        <tr key={tg.id}>
                          <th scope="row"><Link className="dbx-chip" to={`/db?tag=${encodeURIComponent(tg.slug)}`}>{tg.name}</Link></th>
                          <td>{tg.added_by || <span className="dbx-dim">{t('d.unknown')}</span>}</td>
                          <td><Time iso={tg.created_at} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <Comments id={p.id} />
          </>
        )}
    </>
  );
}

function Fact({ k, v, sans }) {
  return <div className="dbx-fact"><dt>{k}</dt><dd className={sans ? 'sans' : ''}>{v}</dd></div>;
}

function Comments({ id }) {
  const { t } = useT();
  const [sp, setSp] = useSearchParams();
  const top = sp.get('top') === '1';
  const page = Math.max(1, parseInt(sp.get('cp'), 10) || 1);
  const upd = (patch) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n);
  };
  const { data, error, loading, reload } = useDb(`/db/products/${id}/comments${qs({ top: top ? 1 : '', page: page > 1 ? page : '' })}`);

  return (
    <section className="dbx-sec" aria-labelledby="dbx-c-h">
      <div className="dbx-sec__head">
        <h2 id="dbx-c-h">{t('d.commentsHeading')} {data && <span className="dbx-dim">{data.total}</span>}</h2>
        <label className="dbx-check">
          <input type="checkbox" checked={top} onChange={(e) => upd({ top: e.target.checked ? '1' : '', cp: '' })} />
          <span>{t('d.topOnly')}</span>
        </label>
      </div>
      {error && error.status !== 401 && error.status !== 403 ? <ErrorBlock error={error} onRetry={reload} />
        : data && data.items.length === 0 ? <Empty title={t('d.emptyComments')} />
        : (
          <div className="dbx-scroll">
            <table className={`dbx-table ${loading && data ? 'is-busy' : ''}`}>
              <thead>
                <tr>
                  <th scope="col" className="num">{t('d.colCommentId')}</th>
                  <th scope="col">{t('d.colWhen')}</th>
                  <th scope="col">{t('d.colName')}</th>
                  <th scope="col" className="num">{t('d.colReplies')}</th>
                  <th scope="col">{t('d.colStatus')}</th>
                  <th scope="col">{t('d.colBody')}</th>
                </tr>
              </thead>
              {!data ? <Skeleton cols={6} rows={5} /> : (
                <tbody key={`${top}-${page}`}>
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" className="num">{c.id}</th>
                      <td className="nowrap"><Time iso={c.created_at} /></td>
                      <td>{c.author || <span className="dbx-dim">{t('d.guest')}</span>}{c.user_id != null && <span className="dbx-dim"> #{c.user_id}</span>}</td>
                      <td className="num">{c.reply_count}</td>
                      <td><span className={`dbx-cs dbx-cs--${c.status}`}>{t(`d.cStatus.${c.status}`)}</span></td>
                      <td className="dbx-body">
                        {c.parent_id != null && <span className="dbx-reply">{t('d.replyTo', { id: c.parent_id })}</span>}
                        <Body text={c.body} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => upd({ cp: n > 1 ? String(n) : '' })} />}
    </section>
  );
}

const CLIP = 140;
function Body({ text }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const long = text.length > CLIP;
  return (
    <span>
      {long && !open ? `${text.slice(0, CLIP).trimEnd()}...` : text}
      {long && <button type="button" className="dbx-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('d.less') : t('d.more')}</button>}
    </span>
  );
}
