import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import { useTitle } from '../hooks.js';
import ProductImage from '../components/ProductImage.jsx';
import { Notice } from '../components/Skeleton.jsx';

export default function Cart() {
  const { t, pick, price } = useT();
  const { items, setQty, remove, subtotal, count } = useCart();
  useTitle(t('cart.title'));

  if (!items.length) {
    return (
      <div className="container page page--narrow">
        <Notice title={t('cart.emptyTitle')} action={<Link to="/shop" className="btn btn--accent">{t('cart.continue')}</Link>}>{t('cart.empty')}</Notice>
      </div>
    );
  }
  return (
    <div className="container page">
      <h1>{t('cart.title')} <span className="muted">({t('cart.items', { n: count })})</span></h1>
      <div className="cart-layout">
        <ul className="cart-list">
          {items.map((i) => (
            <li key={i.docId} className="cart-line">
              <Link to={`/product/${i.slug}`} className="cart-line__img"><ProductImage doc={i} /></Link>
              <div className="cart-line__info">
                <h2><Link to={`/product/${i.slug}`}>{pick(i, 'title')}</Link></h2>
                <p className="muted">{price(i.price)}</p>
                <button type="button" className="link-btn" onClick={() => remove(i.docId)}>{t('cart.remove')}</button>
              </div>
              <div className="qty" role="group" aria-label={t('cart.quantity')}>
                <button type="button" onClick={() => setQty(i.docId, i.qty - 1)} disabled={i.qty <= 1} aria-label={t('cart.decrease')}>−</button>
                <input type="number" min="1" max={i.stock} value={i.qty} aria-label={t('cart.quantity')} onChange={(e) => setQty(i.docId, Number(e.target.value))} />
                <button type="button" onClick={() => setQty(i.docId, i.qty + 1)} disabled={i.qty >= i.stock} aria-label={t('cart.increase')}>+</button>
              </div>
              <p className="cart-line__total"><strong>{price(Math.round(i.price * 100) * i.qty / 100)}</strong></p>
            </li>
          ))}
        </ul>
        <aside className="summary" aria-label={t('cart.summary')}>
          <h2>{t('cart.summary')}</h2>
          <p className="summary__row"><span>{t('cart.subtotal')}</span><strong>{price(subtotal)}</strong></p>
          <p className="summary__row"><span>{t('cart.shipping')}</span><span>{t('cart.shippingNote')}</span></p>
          <p className="summary__row summary__row--total"><span>{t('cart.total')}</span><strong>{price(subtotal)}</strong></p>
          <Link to="/checkout" className="btn btn--accent btn--block btn--lg">{t('cart.checkout')}</Link>
          <p className="hint">{t('cart.payNote')}</p>
          <Link to="/shop" className="link-accent">{t('cart.continue')}</Link>
        </aside>
      </div>
    </div>
  );
}
