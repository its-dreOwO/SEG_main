import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useApi, useTitle } from '../hooks.js';
import { api } from '../api.js';
import { discountPercent } from '../money.js';
import { CardGridSkeleton, Notice, ProductGrid } from '../components/Skeleton.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { CashIcon, HelpIcon, ReturnIcon, TruckIcon } from '../components/Icons.jsx';
import { useCart } from '../cart.jsx';
import { FlipDigit, flyToCart, useHeroSequence, useReveal } from '../motion/index.js';

const PRODUCTS = '/documents?kind=product';

// Chooses products from different categories first so the hero blocks do not repeat each other.
function pickDistinct(list, n) {
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (out.length < n && !seen.has(p.category_slug)) { out.push(p); seen.add(p.category_slug); }
  }
  for (const p of list) {
    if (out.length < n && !out.includes(p)) out.push(p);
  }
  return out;
}

function PriceLine({ p, big }) {
  const { price } = useT();
  return (
    <p className={`priceline ${big ? 'priceline--big' : ''}`}>
      {p.compare_at_price > p.price && <del>{price(p.compare_at_price)}</del>}
      <strong>{price(p.price)}</strong>
    </p>
  );
}

function Hero({ pool }) {
  const { t, pick, price } = useT();
  const { hero, promos } = pool;
  const ref = useHeroSequence(Boolean(hero));
  if (!hero) return pool.loaded ? null : <div className="hero hero--skeleton skeleton" aria-hidden="true" />;
  return (
    <section className="hero" aria-label={t('home.hero.label')} ref={ref}>
      <div className="hero__main">
        <div className="hero__text">
          <p className="eyebrow">{t('home.hero.eyebrow')}</p>
          <h1>{pick(hero, 'title')}</h1>
          <p className="hero__sum">{pick(hero, 'summary')}</p>
          <PriceLine p={hero} big />
          <Link to={`/product/${hero.slug}`} className="btn btn--accent">{t('home.shopNow')}</Link>
        </div>
        <div className="hero__art"><div className="hero__frame"><ProductImage doc={hero} loading="eager" /></div></div>
      </div>
      <div className="hero__side">
        {promos.map((p, i) => (
          <Link key={p.id} to={`/product/${p.slug}`} className={`promo ${i === 0 ? 'promo--cream' : 'promo--grey'}`}>
            <div className="promo__text">
              <h2>{pick(p, 'title')}</h2>
              <p className="promo__from">{t('home.from')} <strong>{price(p.price)}</strong></p>
              <span className="link-accent">{t('home.shopNow')} »</span>
            </div>
            <ProductImage doc={p} loading="eager" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoryRow() {
  const { t, pick, categories } = useT();
  const [tiles, setTiles] = useState(null);
  const ref = useReveal('.cats li', [categories.length]);
  useEffect(() => {
    if (!categories.length) return undefined;
    let live = true;
    Promise.all(categories.map((c) => api(`${PRODUCTS}&category=${c.slug}&limit=1`).then((r) => ({ c, total: r.total, sample: r.items[0] })).catch(() => ({ c, total: 0, sample: null }))))
      .then((r) => { if (live) setTiles(r); });
    return () => { live = false; };
  }, [categories]);
  return (
    <section className="section" aria-labelledby="cats-h" ref={ref}>
      <h2 id="cats-h" className="section-title section-title--center">{t('home.categories')}</h2>
      <ul className="cats">
        {(tiles || categories.map((c) => ({ c, total: null, sample: null }))).map(({ c, total, sample }) => (
          <li key={c.id}>
            <Link to={`/shop?category=${c.slug}`} className="cat">
              <span className="cat__img">{sample ? <ProductImage doc={sample} /> : <span className="skeleton cat__ph" aria-hidden="true" />}</span>
              <strong>{pick(c, 'name')}</strong>
              <small>{total === null ? ' ' : t('home.productCount', { n: total })}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewArrivals() {
  const { t, pick, categories } = useT();
  const [tab, setTab] = useState('');
  const { data, loading, error, reload } = useApi(`${PRODUCTS}&sort=newest&limit=8${tab ? `&category=${tab}` : ''}`);
  return (
    <section className="section" aria-labelledby="new-h">
      <div className="section-head">
        <h2 id="new-h" className="section-title">{t('home.newArrivals')}</h2>
        <div className="tabs" role="group" aria-label={t('home.filterByCategory')}>
          <button type="button" className={tab === '' ? 'is-on' : ''} aria-pressed={tab === ''} onClick={() => setTab('')}>{t('home.all')}</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={tab === c.slug ? 'is-on' : ''} aria-pressed={tab === c.slug} onClick={() => setTab(c.slug)}>{pick(c, 'name')}</button>
          ))}
        </div>
      </div>
      <div aria-live="polite">
        {loading && <CardGridSkeleton n={8} />}
        {error && <Notice title={t('common.errorTitle')} action={<button type="button" className="btn btn--accent" onClick={reload}>{t('common.retry')}</button>}>{t('common.errorText')}</Notice>}
        {data && (data.items.length ? <ProductGrid items={data.items} /> : <Notice title={t('catalog.noneTitle')}>{t('catalog.none')}</Notice>)}
      </div>
      {data && data.items.length > 0 && <p className="section-more"><Link to="/shop?sort=newest" className="btn btn--outline">{t('home.viewAll')}</Link></p>}
    </section>
  );
}

function useCountdown() {
  // The deal runs until the end of the local day.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const left = Math.max(0, Math.floor((end - now) / 1000));
  return { h: Math.floor(left / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
}

function Deal({ deal }) {
  const { t, pick } = useT();
  const cart = useCart();
  const { h, m, s } = useCountdown();
  const ref = useReveal('.deal__left, .deal__right, .deal__art', [Boolean(deal)], { stagger: 0.1, y: 0 });
  const two = (n) => String(n).padStart(2, '0');
  if (!deal) return null;
  const off = discountPercent(deal.price, deal.compare_at_price);
  const soldOut = deal.stock <= 0;
  return (
    <section className="deal" aria-labelledby="deal-h" id="deal" ref={ref}>
      <div className="deal__left">
        <p className="eyebrow">{t('home.deal.eyebrow')}</p>
        <h2 id="deal-h">{pick(deal, 'title')}</h2>
        <PriceLine p={deal} big />
        {off > 0 && <p className="deal__off">{t('home.deal.save', { n: off })}</p>}
        <hr />
        <p className="eyebrow">{t('home.deal.endsIn')}</p>
        <div className="countdown" role="timer" aria-label={t('home.deal.endsIn')}>
          {[[h, t('home.deal.hours')], [m, t('home.deal.minutes')], [s, t('home.deal.seconds')]].map(([n, label], i) => (
            <div key={label} className="countdown__cell">
              <FlipDigit className="countdown__n" value={two(n)} />
              <small>{label}</small>
              {i < 2 && <span className="countdown__sep" aria-hidden="true">:</span>}
            </div>
          ))}
        </div>
        <div className="deal__actions">
          <Link to={`/product/${deal.slug}`} className="btn btn--outline">{t('home.deal.details')}</Link>
          <button type="button" className="btn btn--accent" disabled={soldOut} onClick={(e) => { flyToCart(e.currentTarget.closest('.deal')?.querySelector('.deal__art')); cart.add(deal, 1); }}>{soldOut ? t('card.soldOut') : t('card.add')}</button>
        </div>
      </div>
      <div className="deal__right" aria-hidden="true" />
      <div className="deal__art"><ProductImage doc={deal} loading="eager" /></div>
    </section>
  );
}

function Services() {
  const { t } = useT();
  const ref = useReveal('li', []);
  const items = [
    [TruckIcon, 'delivery'], [ReturnIcon, 'returns'], [CashIcon, 'cod'], [HelpIcon, 'help'],
  ];
  return (
    <section className="services" aria-label={t('home.services.label')} ref={ref}>
      <ul>
        {items.map(([Icon, k]) => (
          <li key={k}><Icon size={34} /><div><strong>{t(`home.services.${k}`)}</strong><span>{t(`home.services.${k}Text`)}</span></div></li>
        ))}
      </ul>
    </section>
  );
}

function TopSelling() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(`${PRODUCTS}&sort=top&limit=4`);
  return (
    <section className="section" aria-labelledby="top-h">
      <div className="section-head">
        <h2 id="top-h" className="section-title">{t('home.topSelling')}</h2>
        <Link to="/shop?sort=top" className="link-accent">{t('home.viewAll')} »</Link>
      </div>
      {loading && <CardGridSkeleton n={4} />}
      {error && <Notice title={t('common.errorTitle')} action={<button type="button" className="btn btn--accent" onClick={reload}>{t('common.retry')}</button>}>{t('common.errorText')}</Notice>}
      {data && <ProductGrid items={data.items} />}
    </section>
  );
}

function Articles() {
  const { t, pick, date } = useT();
  const { data } = useApi('/documents?kind=article&limit=3');
  const ref = useReveal('.article', [data]);
  if (!data || !data.items.length) return null;
  return (
    <section className="section" aria-labelledby="blog-h" ref={ref}>
      <h2 id="blog-h" className="section-title">{t('home.articles')}</h2>
      <div className="articles">
        {data.items.map((a, i) => (
          <article key={a.id} className="article">
            <Link to={`/article/${a.slug}`} className={`article__img article__img--${i % 3}`} tabIndex={-1} aria-hidden="true">
              {a.image_url ? <ProductImage doc={a} /> : <span>{(a.title || '?').slice(0, 1)}</span>}
            </Link>
            <p className="article__meta">{date(a.created_at)} · {a.author}</p>
            <h3><Link to={`/article/${a.slug}`}>{pick(a, 'title')}</Link></h3>
            <p className="article__sum">{pick(a, 'summary')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useT();
  useTitle('');
  const { data: poolData, error: poolError } = useApi(`${PRODUCTS}&sort=newest&limit=50`);
  const pool = useMemo(() => {
    if (!poolData) return { loaded: Boolean(poolError) };
    const ok = poolData.items.filter((p) => p.image_url && p.stock > 0);
    const byDiscount = [...ok].sort((a, b) => discountPercent(b.price, b.compare_at_price) - discountPercent(a.price, a.compare_at_price));
    const deal = byDiscount[0];
    const rest = byDiscount.slice(1);
    const [hero, ...promos] = pickDistinct(rest, 3);
    return { deal, hero, promos, loaded: true };
  }, [poolData]);

  return (
    <div className="container home">
      <Hero pool={pool} />
      <CategoryRow />
      <NewArrivals />
      {pool.loaded ? <Deal deal={pool.deal} /> : <div className="deal deal--skeleton skeleton" aria-label={t('common.loading')} />}
      <Services />
      <TopSelling />
      <Articles />
    </div>
  );
}
