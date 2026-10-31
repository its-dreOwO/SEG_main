import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { useCart } from '../cart.jsx';
import { api } from '../api.js';
import { errText, useApi, useTitle } from '../hooks.js';
import { discountPercent } from '../money.js';
import Stars from '../components/Stars.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { Notice } from '../components/Skeleton.jsx';
import { HeartIcon, StarShape } from '../components/Icons.jsx';
import NotFound from './NotFound.jsx';

function LoginPrompt({ action, onClose }) {
  const { t } = useT();
  const loc = useLocation();
  return (
    <div className="callout" role="alert">
      <p>{t('product.loginNeeded', { action })} <button type="button" className="toast__x" onClick={onClose} aria-label={t('common.close')}>×</button></p>
      <p>
        <Link to="/login" state={{ from: loc.pathname }} className="btn btn--accent btn--sm">{t('auth.login')}</Link>{' '}
        <Link to="/register" state={{ from: loc.pathname }} className="btn btn--outline btn--sm">{t('auth.register')}</Link>
      </p>
    </div>
  );
}

function RatingInput({ doc, onRate, busy }) {
  const { t } = useT();
  const [hover, setHover] = useState(0);
  const shown = hover || doc.my_rating || 0;
  return (
    <div className="rate" role="radiogroup" aria-label={t('product.yourRating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={doc.my_rating === n} disabled={busy}
          className={n <= shown ? 'is-on' : ''} aria-label={t('product.rateStars', { n })}
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onFocus={() => setHover(n)} onBlur={() => setHover(0)}
          onClick={() => onRate(n)}><StarShape size={26} /></button>
      ))}
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const { t, pick, price, date, catName } = useT();
  const { user } = useAuth();
  const cart = useCart();
  const { data: doc, loading, error, setData } = useApi(`/documents/${encodeURIComponent(slug)}`);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [tagName, setTagName] = useState('');

  useTitle(doc ? pick(doc, 'title') : '');

  if (loading) return <div className="container page"><div className="product-skel"><div className="skeleton product-skel__img" /><div><div className="skeleton skeleton--line" /><div className="skeleton skeleton--line short" /><div className="skeleton skeleton--line" /></div></div></div>;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container page"><Notice title={t('common.errorTitle')}>{t('common.errorText')}</Notice></div>;
  if (!doc) return null;

  const isProduct = doc.kind === 'product';
  const soldOut = isProduct && doc.stock <= 0;
  const inCart = cart.items.find((i) => i.docId === doc.id)?.qty ?? 0;
  const room = Math.max(0, doc.stock - inCart);
  const off = discountPercent(doc.price, doc.compare_at_price);

  const guard = (actionKey) => {
    if (user) { setPrompt(''); return true; }
    setPrompt(t(actionKey));
    return false;
  };
  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) { setMsg(errText(e, t)); } finally { setBusy(false); }
  };

  const addToCart = () => {
    cart.add(doc, Math.min(qty, Math.max(room, 1)));
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };
  const like = () => guard('product.actLike') && run(async () => {
    const r = await api(`/documents/${doc.id}/like`, { method: 'POST' });
    setData((d) => ({ ...d, likes_count: r.count, liked: r.liked }));
  });
  const rate = (n) => guard('product.actRate') && run(async () => {
    const r = doc.my_rating === n
      ? await api(`/documents/${doc.id}/rating`, { method: 'DELETE' })
      : await api(`/documents/${doc.id}/rating`, { method: 'POST', body: { value: n } });
    setData((d) => ({ ...d, my_rating: r.my_rating, rating: r.rating, rating_count: r.rating_count }));
  });
  const addTag = (e) => {
    e.preventDefault();
    if (!guard('product.actTag')) return;
    const name = tagName.trim();
    if (name.length < 2 || name.length > 30) { setMsg(t('product.tagLength')); return; }
    run(async () => {
      const tag = await api(`/documents/${doc.id}/tags`, { method: 'POST', body: { name } });
      setData((d) => (d.tags.some((x) => x.id === tag.id) ? d : { ...d, tags: [...d.tags, { ...tag, added_by: user.id }].sort((a, b) => a.name.localeCompare(b.name)) }));
      setTagName('');
    });
  };
  const postComment = (e) => {
    e.preventDefault();
    if (!guard('product.actComment')) return;
    const body = comment.trim();
    if (!body) { setMsg(t('product.commentEmpty')); return; }
    run(async () => {
      const c = await api(`/documents/${doc.id}/comments`, { method: 'POST', body: { body } });
      setComment('');
      if (c.status === 'visible') {
        setData((d) => ({ ...d, comments: [...d.comments, { ...c, user_id: user.id, author: user.display_name }] }));
      } else {
        setMsg(t('product.commentPending'));
      }
    });
  };

  return (
    <div className="container page">
      <nav className="crumbs" aria-label={t('common.breadcrumb')}>
        <Link to="/">{t('nav.home')}</Link><span aria-hidden="true">/</span>
        <Link to={isProduct ? '/shop' : '/'}>{isProduct ? t('catalog.title') : t('product.article')}</Link>
        {doc.category_slug && <><span aria-hidden="true">/</span><Link to={`/shop?category=${doc.category_slug}`}>{catName(doc.category_slug, doc.category)}</Link></>}
      </nav>

      <div className={`pdp ${doc.image_url ? '' : 'pdp--noimg'}`}>
        {doc.image_url && (
          <div className="pdp__media">
            <ProductImage doc={doc} loading="eager" />
            {off > 0 && !soldOut && <span className="badge badge--accent">-{off}%</span>}
          </div>
        )}
        <div className="pdp__info">
          {doc.category_slug && <p className="eyebrow">{catName(doc.category_slug, doc.category)}</p>}
          <h1>{pick(doc, 'title')}</h1>
          {isProduct && (
            <div className="pdp__rating">
              <Stars value={doc.rating} count={doc.rating_count} size={18} />
              <span>{doc.rating_count ? t('product.ratingSummary', { value: (doc.rating || 0).toFixed(1), count: doc.rating_count }) : t('product.noRatings')}</span>
            </div>
          )}
          {isProduct && doc.price !== null && (
            <p className="pdp__price"><strong>{price(doc.price)}</strong>{doc.compare_at_price > doc.price && <del>{price(doc.compare_at_price)}</del>}</p>
          )}
          <p className="pdp__sum">{pick(doc, 'summary')}</p>

          {isProduct && (
            <>
              <p className={`stock ${soldOut ? 'stock--out' : ''}`}>
                {soldOut ? t('product.soldOut') : doc.stock <= 5 ? t('product.lowStock', { n: doc.stock }) : t('product.inStock')}
              </p>
              <div className="buy">
                <div className="qty" role="group" aria-label={t('cart.quantity')}>
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t('cart.decrease')} disabled={soldOut}>−</button>
                  <input type="number" min="1" max={Math.max(room, 1)} value={qty} aria-label={t('cart.quantity')} disabled={soldOut}
                    onChange={(e) => setQty(Math.max(1, Math.min(Number(e.target.value) || 1, Math.max(room, 1))))} />
                  <button type="button" onClick={() => setQty((q) => Math.min(q + 1, Math.max(room, 1)))} aria-label={t('cart.increase')} disabled={soldOut}>+</button>
                </div>
                <button type="button" className="btn btn--accent btn--lg" onClick={addToCart} disabled={soldOut || room < 1}>
                  {soldOut ? t('card.soldOut') : room < 1 ? t('card.maxInCart') : added ? t('card.added') : t('card.add')}
                </button>
              </div>
              {inCart > 0 && <p className="hint"><Link to="/cart">{t('product.inCart', { n: inCart })}</Link></p>}
            </>
          )}

          <div className="pdp__actions">
            <button type="button" className={`like ${doc.liked ? 'is-on' : ''}`} aria-pressed={doc.liked} onClick={like} disabled={busy}>
              <HeartIcon size={18} /> {doc.liked ? t('product.liked') : t('product.like')} <span className="like__n">{doc.likes_count}</span>
            </button>
          </div>

          <dl className="meta">
            <div><dt>{t('product.author')}</dt><dd>{doc.author || '-'}</dd></div>
            <div><dt>{t('product.published')}</dt><dd><time dateTime={doc.created_at}>{date(doc.created_at)}</time></dd></div>
            <div><dt>{t('product.views')}</dt><dd>{doc.views_count.toLocaleString()}</dd></div>
            {doc.category_slug && <div><dt>{t('product.category')}</dt><dd><Link to={`/shop?category=${doc.category_slug}`}>{catName(doc.category_slug, doc.category)}</Link></dd></div>}
            {doc.brand && <div><dt>{t('product.brand')}</dt><dd>{doc.brand}</dd></div>}
          </dl>
        </div>
      </div>

      <section className="block" aria-labelledby="tags-h">
        <h2 id="tags-h" className="block__title">{t('product.tags')}</h2>
        {doc.tags.length === 0 ? <p className="muted">{t('product.noTags')}</p> : (
          <ul className="chips">{doc.tags.map((x) => <li key={x.id}><Link to={`/shop?tag=${x.slug}`}>#{x.name}</Link></li>)}</ul>
        )}
        <form className="inline-form" onSubmit={addTag}>
          <label htmlFor="new-tag">{t('product.addTag')}</label>
          <input id="new-tag" value={tagName} maxLength={30} onChange={(e) => setTagName(e.target.value)} placeholder={t('product.tagPlaceholder')} />
          <button type="submit" className="btn btn--outline btn--sm" disabled={busy}>{t('product.addTagBtn')}</button>
        </form>
      </section>

      <section className="block" aria-labelledby="desc-h">
        <h2 id="desc-h" className="block__title">{t('product.description')}</h2>
        {/* content is sanitised on the server; this is the only place HTML is rendered */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: pick(doc, 'content') }} />
      </section>

      {isProduct && (
        <section className="block" aria-labelledby="rate-h">
          <h2 id="rate-h" className="block__title">{t('product.rateTitle')}</h2>
          <RatingInput doc={doc} onRate={rate} busy={busy} />
          <p className="hint">{doc.my_rating ? t('product.youRated', { n: doc.my_rating }) : t('product.rateHint')}</p>
        </section>
      )}

      <section className="block" aria-labelledby="comments-h">
        <h2 id="comments-h" className="block__title">{t('product.comments')} ({doc.comments.length})</h2>
        {doc.comments.length === 0 ? <p className="muted">{t('product.noComments')}</p> : (
          <ul className="comments">
            {doc.comments.map((c) => (
              <li key={c.id}>
                <p className="comments__who"><strong>{c.author}</strong> <time dateTime={c.created_at}>{date(c.created_at)}</time></p>
                <p className="comments__body">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="comment-form" onSubmit={postComment}>
          <label htmlFor="comment">{t('product.writeComment')}</label>
          <textarea id="comment" rows="4" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button type="submit" className="btn btn--accent" disabled={busy}>{t('product.postComment')}</button>
        </form>
      </section>

      <div className="toast-wrap" aria-live="polite">
        {prompt && <LoginPrompt action={prompt} onClose={() => setPrompt('')} />}
        {msg && <p className="toast" role="status">{msg} <button type="button" className="toast__x" onClick={() => setMsg('')} aria-label={t('common.close')}>×</button></p>}
      </div>
    </div>
  );
}
