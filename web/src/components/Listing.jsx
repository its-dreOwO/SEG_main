import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useApi, useMedia, useTitle } from '../hooks.js';
import { api, qs } from '../api.js';
import Pagination from './Pagination.jsx';
import { CardGridSkeleton, Notice, ProductGrid } from './Skeleton.jsx';

const FILTER_KEYS = ['category', 'tag', 'from', 'to', 'minPrice', 'maxPrice'];
const SORTS = ['newest', 'top', 'views', 'price_asc', 'price_desc'];
const PER_PAGE = 12;

// Shared listing for the catalog and for search results: filters live in the URL.
export default function Listing({ mode }) {
  const { t, pick, categories } = useT();
  const [params, setParams] = useSearchParams();
  const isSearch = mode === 'search';
  const q = isSearch ? (params.get('q') || '').trim() : '';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));

  const [draft, setDraft] = useState(filters);
  const filterSig = FILTER_KEYS.map((k) => params.get(k) || '').join('|');
  useEffect(() => { setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']))); }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = useApi('/tags');
  const canFetch = !isSearch || q;
  const path = canFetch ? `/documents${qs({ kind: 'product', q, ...filters, sort: sort === 'newest' ? '' : sort, page: page > 1 ? page : '', limit: PER_PAGE })}` : null;
  const { data, error, loading, reload } = useApi(path);
  const desktop = useMedia('(min-width: 900px)');

  const activeCat = categories.find((c) => c.slug === filters.category);
  const heading = isSearch ? t('search.title') : activeCat ? pick(activeCat, 'name') : t('catalog.title');
  useTitle(isSearch && q ? `${t('search.results', { q })}` : heading);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k); else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  const apply = (e) => { e.preventDefault(); update(draft); };
  const reset = () => {
    const next = new URLSearchParams();
    if (isSearch && q) next.set('q', q);
    setParams(next);
  };
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);
  const setPage = (n) => { update({ page: n > 1 ? n : '' }); window.scrollTo({ top: 0 }); };

  const onOpen = useMemo(() => (isSearch ? (p) => { api('/search/click', { method: 'POST', body: { query: q, docId: p.id } }).catch(() => {}); } : undefined), [isSearch, q]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="container page">
      <nav className="crumbs" aria-label={t('common.breadcrumb')}>
        <Link to="/">{t('nav.home')}</Link><span aria-hidden="true">/</span><span>{isSearch ? t('search.title') : t('catalog.title')}</span>
      </nav>
      <div className="listing-head">
        <div>
          <p className="eyebrow">{isSearch ? t('search.eyebrow') : t('catalog.eyebrow')}</p>
          <h1>{isSearch && q ? t('search.results', { q }) : heading}</h1>
        </div>
        <div className="sortbox">
          <label htmlFor="sort">{t('filters.sort')}</label>
          <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </div>
      </div>

      <div className="listing">
        <details className="filters" open={desktop || undefined}>
          <summary>{t('filters.title')}{hasFilters ? ` (${FILTER_KEYS.filter((k) => filters[k]).length})` : ''}</summary>
          <form onSubmit={apply} className="filters__form">
            {isSearch && (
              <p className="filters__q">{q ? t('search.for', { q }) : ''}</p>
            )}
            <div className="field">
              <label htmlFor="f-cat">{t('filters.category')}</label>
              <select id="f-cat" value={draft.category} onChange={set('category')}>
                <option value="">{t('filters.allCategories')}</option>
                {categories.map((c) => <option key={c.id} value={c.slug}>{pick(c, 'name')}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-tag">{t('filters.tag')}</label>
              <select id="f-tag" value={draft.tag} onChange={set('tag')}>
                <option value="">{t('filters.allTags')}</option>
                {(tags.data || []).filter((x) => x.count > 0).map((x) => <option key={x.id} value={x.slug}>{x.name} ({x.count})</option>)}
              </select>
            </div>
            <fieldset className="field field--pair">
              <legend>{t('filters.price')}</legend>
              <div>
                <label htmlFor="f-min" className="sr-only">{t('filters.minPrice')}</label>
                <input id="f-min" type="number" min="0" step="1" inputMode="decimal" placeholder={t('filters.min')} value={draft.minPrice} onChange={set('minPrice')} />
              </div>
              <div>
                <label htmlFor="f-max" className="sr-only">{t('filters.maxPrice')}</label>
                <input id="f-max" type="number" min="0" step="1" inputMode="decimal" placeholder={t('filters.max')} value={draft.maxPrice} onChange={set('maxPrice')} />
              </div>
            </fieldset>
            <fieldset className="field field--pair">
              <legend>{t('filters.date')}</legend>
              <div>
                <label htmlFor="f-from">{t('filters.from')}</label>
                <input id="f-from" type="date" value={draft.from} max={draft.to || undefined} onChange={set('from')} />
              </div>
              <div>
                <label htmlFor="f-to">{t('filters.to')}</label>
                <input id="f-to" type="date" value={draft.to} min={draft.from || undefined} onChange={set('to')} />
              </div>
            </fieldset>
            <div className="filters__actions">
              <button type="submit" className="btn btn--accent">{t('filters.apply')}</button>
              {hasFilters && <button type="button" className="btn btn--ghost" onClick={reset}>{t('filters.reset')}</button>}
            </div>
          </form>
        </details>

        <section aria-live="polite" aria-label={t('catalog.results')}>
          {!canFetch && <Notice title={t('search.emptyQueryTitle')}>{t('search.emptyQuery')}</Notice>}
          {canFetch && loading && !data && <CardGridSkeleton n={6} />}
          {canFetch && error && <Notice title={t('common.errorTitle')} action={<button type="button" className="btn btn--accent" onClick={reload}>{t('common.retry')}</button>}>{t('common.errorText')}</Notice>}
          {canFetch && data && (
            data.items.length === 0
              ? <Notice title={isSearch ? t('search.noneTitle', { q }) : t('catalog.noneTitle')}
                  action={hasFilters || q ? <button type="button" className="btn btn--accent" onClick={reset}>{t('filters.reset')}</button> : null}>
                  {isSearch ? t('search.none') : t('catalog.none')}
                </Notice>
              : <>
                  <p className="count">{t('catalog.count', { n: data.total })}</p>
                  <ProductGrid items={data.items} onOpen={onOpen} />
                  <Pagination page={data.page} pages={data.pages} onChange={setPage} />
                </>
          )}
        </section>
      </div>
    </div>
  );
}
