import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { useCart } from '../cart.jsx';
import { api } from '../api.js';
import { errText, useTitle } from '../hooks.js';
import { Notice } from '../components/Skeleton.jsx';

const newToken = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function Checkout() {
  const { t, pick, price } = useT();
  const { user, loading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // One token per checkout attempt: a retry after a network failure cannot create a second order.
  const token = useRef(newToken());
  useTitle(t('checkout.title'));

  if (loading) return <div className="container page page--narrow"><div className="skeleton skeleton--line" /></div>;
  if (!items.length) {
    return <div className="container page page--narrow"><Notice title={t('cart.emptyTitle')} action={<Link to="/shop" className="btn btn--accent">{t('cart.continue')}</Link>}>{t('cart.empty')}</Notice></div>;
  }
  if (!user) {
    return (
      <div className="container page page--narrow">
        <Notice title={t('checkout.loginTitle')} action={
          <p><Link to="/login" state={{ from: '/checkout' }} className="btn btn--accent">{t('auth.login')}</Link>{' '}
            <Link to="/register" state={{ from: '/checkout' }} className="btn btn--outline">{t('auth.register')}</Link></p>
        }>{t('checkout.loginText')}</Notice>
      </div>
    );
  }

  const explain = (e) => {
    if (e.status === 409) {
      const m = /^Not enough stock for (.+)$/.exec(e.message);
      return m ? t('checkout.noStockNamed', { name: m[1] }) : t('checkout.noStock');
    }
    if (e.status === 404) return t('checkout.gone');
    if (e.status === 401) return t('checkout.sessionExpired');
    return errText(e, t);
  };

  const submit = async (e) => {
    e.preventDefault();
    const addr = address.trim();
    if (addr.length < 8) { setError({ message: t('checkout.addressShort') }); return; }
    setBusy(true); setError(null);
    try {
      const fullAddress = phone.trim() ? `${addr} (${t('checkout.phone')}: ${phone.trim()})` : addr;
      const order = await api('/orders', { method: 'POST', body: { clientToken: token.current, address: fullAddress, items: items.map((i) => ({ docId: i.docId, qty: i.qty })) } });
      clear();
      navigate(`/order/${order.id}`, { state: { order }, replace: true });
    } catch (err) {
      setError({ message: explain(err), stock: err.status === 409 || err.status === 404 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <h1>{t('checkout.title')}</h1>
      <div className="cart-layout">
        <form className="form" onSubmit={submit} noValidate>
          <h2>{t('checkout.delivery')}</h2>
          <p className="muted">{t('checkout.orderingAs', { name: user.display_name })}</p>
          <div className="field">
            <label htmlFor="address">{t('checkout.address')}</label>
            <textarea id="address" rows="3" required maxLength={450} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
          </div>
          <div className="field">
            <label htmlFor="phone">{t('checkout.phone')} <span className="muted">({t('common.optional')})</span></label>
            <input id="phone" type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <h2>{t('checkout.payment')}</h2>
          <div className="cod">
            <strong>{t('checkout.cod')}</strong>
            <p>{t('checkout.codText')}</p>
          </div>
          {error && (
            <div className="alert" role="alert">
              <p>{error.message}</p>
              {error.stock && <p><Link to="/cart" className="link-accent">{t('checkout.reviewCart')}</Link></p>}
            </div>
          )}
          <button type="submit" className="btn btn--accent btn--lg" disabled={busy}>{busy ? t('checkout.placing') : t('checkout.place')}</button>
        </form>
        <aside className="summary" aria-label={t('cart.summary')}>
          <h2>{t('cart.summary')}</h2>
          <ul className="summary__items">
            {items.map((i) => (
              <li key={i.docId}><span>{pick(i, 'title')} × {i.qty}</span><span>{price(Math.round(i.price * 100) * i.qty / 100)}</span></li>
            ))}
          </ul>
          <p className="summary__row summary__row--total"><span>{t('cart.total')}</span><strong>{price(subtotal)}</strong></p>
          <p className="hint">{t('cart.payNote')}</p>
        </aside>
      </div>
    </div>
  );
}
