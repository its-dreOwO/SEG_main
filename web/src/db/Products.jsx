import { useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useT } from '../i18n.jsx';
import { useApi, useTitle } from '../hooks.js';
import Pagination from '../components/Pagination.jsx';
import { Empty, ErrorBlock, QueryInput, Select, SortTh, Skeleton, Stock, useDb } from './ui.jsx';
import { activeFilterCount, nextSort, queryLine, readProductFilters, sortState, writeProductFilters } from './query.js';

const SORT_OPTS = [
  ['newest', 'd.sortNewest'], ['title', 'd.sortTitle'], ['stock_asc', 'd.sortStockAsc'], ['stock_desc', 'd.sortStockDesc'],
  ['price_asc', 'd.sortPriceAsc'], ['price_desc', 'd.sortPriceDesc'], ['views', 'd.sortViews'], ['comments', 'd.sortComments'],
];

export default function Products() {
  const { t, price } = useT();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const f = readProductFilters(sp);
  useTitle(t('d.tabProducts') + ' | ' + t('d.title'));

  // Filter changes reset to page 1 and replace history for typing, push for discrete choices.
  const set = useCallback((patch, replace = false) => {
    setSp(writeProductFilters({ ...f, page: 1, ...patch }), { replace });
  }, [f, setSp]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: tags } = useApi('/db/tags');
  const { data: cats } = useApi('/db/categories');
  const path = `/db/products${qs({ q: f.q, tag: f.tag, category: f.category, stock: f.stock, sort: f.sort === 'newest' ? '' : f.sort, page: f.page > 1 ? f.page : '' })}`;
  const { data, error, loading, reload } = useDb(path);

  const readout = queryLine('products', f, data ? data.total : null);
  const open = (id) => navigate(`/db/product/${id}`);
  const filtered = activeFilterCount(f) > 0;
  const COLS = 8;

  return (
    <>
      <QueryInput value={f.q} onCommit={(q) => set({ q }, true)} placeholder={t('d.searchProducts')} readout={readout} />
      <div className="dbx-filters">
        <Select label={t('d.filterTag')} value={f.tag} onChange={(v) => set({ tag: v })} all={t('d.allTags')}
          opts={(tags?.items || []).map((x) => [x.slug, `${x.name} (${x.product_count})`])} />
        <Select label={t('d.filterCategory')} value={f.category} onChange={(v) => set({ category: v })} all={t('d.allCategories')}
          opts={(cats?.items || []).map((x) => [x.slug, `${x.name} (${x.product_count})`])} />
        <Select label={t('d.filterStock')} value={f.stock} onChange={(v) => set({ stock: v })} all={t('d.allStock')}
          opts={[['in', t('d.stockIn')], ['low', t('d.stockLow')], ['out', t('d.stockOut')]]} />
        <Select label={t('d.sort')} value={f.sort} onChange={(v) => set({ sort: v })} opts={SORT_OPTS.map(([v, k]) => [v, t(k)])} />
        {filtered && <button type="button" className="dbx-btn dbx-btn--sm" onClick={() => setSp(new URLSearchParams(), { replace: false })}>{t('d.clear')}</button>}
      </div>

      {error && error.status !== 401 && error.status !== 403 ? <ErrorBlock error={error} onRetry={reload} /> : (
        data && data.items.length === 0 ? (
          <Empty title={t('d.emptyProducts')} onClear={filtered ? () => setSp(new URLSearchParams()) : null} />
        ) : (
          <div className="dbx-scroll">
            <table className={`dbx-table ${loading && data ? 'is-busy' : ''}`}>
              <thead>
                <tr>
                  <th scope="col" className="num">{t('d.colId')}</th>
                  <SortTh col="title" label={t('d.colProduct')} state={sortState(f.sort, 'title')} onSort={(c) => set({ sort: nextSort(f.sort, c) })} />
                  <th scope="col">{t('d.colCategory')}</th>
                  <th scope="col">{t('d.colTags')}</th>
                  <SortTh col="stock" num label={t('d.colStock')} state={sortState(f.sort, 'stock')} onSort={(c) => set({ sort: nextSort(f.sort, c) })} />
                  <SortTh col="price" num label={t('d.colPrice')} state={sortState(f.sort, 'price')} onSort={(c) => set({ sort: nextSort(f.sort, c) })} />
                  <SortTh col="views" num label={t('d.colViews')} state={sortState(f.sort, 'views')} onSort={(c) => set({ sort: nextSort(f.sort, c) })} />
                  <SortTh col="comments" num label={t('d.colComments')} state={sortState(f.sort, 'comments')} onSort={(c) => set({ sort: nextSort(f.sort, c) })} />
                </tr>
              </thead>
              {!data ? <Skeleton cols={COLS} /> : (
                <tbody key={path}>
                  {data.items.map((p) => (
                    <tr key={p.id} className="is-row" tabIndex={0} onClick={() => open(p.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(p.id); }}>
                      <td className="num dbx-dim">{p.id}</td>
                      <th scope="row" className="dbx-prod">
                        <Link to={`/db/product/${p.id}`} onClick={(e) => e.stopPropagation()} aria-label={t('d.open', { id: p.id }) + ': ' + p.title}>{p.title}</Link>
                        <span className="dbx-dim">{p.brand || ''}{p.status === 'draft' ? ` · ${t('d.draft')}` : ''}</span>
                      </th>
                      <td>{p.category}</td>
                      <td>
                        <span className="dbx-chips">
                          {p.tags.map((tg) => (
                            <button type="button" key={tg} className="dbx-chip" aria-label={t('d.filterByTag', { tag: tg })}
                              onClick={(e) => { e.stopPropagation(); set({ tag: slugOf(tags, tg) }); }}>{tg}</button>
                          ))}
                        </span>
                      </td>
                      <td className="num"><Stock n={p.stock} /></td>
                      <td className="num">{p.price === null ? <span className="dbx-dim">-</span> : price(p.price)}</td>
                      <td className="num">{p.views_count.toLocaleString('en-US')}</td>
                      <td className="num">{p.comment_count}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )
      )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={(page) => { setSp(writeProductFilters({ ...f, page })); window.scrollTo(0, 0); }} />}
    </>
  );
}

// Products list tag names; the tag filter takes a slug, so map back through /db/tags (fall back to the name).
function slugOf(tags, name) {
  const hit = (tags?.items || []).find((x) => x.name === name);
  return hit ? hit.slug : name;
}
