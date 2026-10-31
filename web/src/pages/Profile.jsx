import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { errText, useApi, useTitle } from '../hooks.js';
import { Notice } from '../components/Skeleton.jsx';

export default function Profile() {
  const { t, price, date } = useT();
  const { user, loading, setUser, logout } = useAuth();
  const { hash } = useLocation();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const orders = useApi(user ? '/orders' : null);
  useTitle(t('profile.title'));

  useEffect(() => {
    if (user) { setName(user.display_name); setBio(user.bio || ''); }
  }, [user]);
  useEffect(() => {
    if (hash === '#orders' && orders.data) document.getElementById('orders')?.scrollIntoView();
  }, [hash, orders.data]);

  if (loading) return <div className="container page page--narrow"><div className="skeleton skeleton--line" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: '/profile' }} replace />;

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length > 80) { setMsg({ type: 'error', text: t('auth.nameInvalid') }); return; }
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const u = await api('/me', { method: 'PATCH', body: { display_name: name.trim(), bio } });
      setUser(u);
      setMsg({ type: 'ok', text: t('profile.saved') });
    } catch (err) {
      setMsg({ type: 'error', text: errText(err, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <p className="eyebrow">{t('profile.eyebrow')}</p>
      <h1>{t('profile.title')}</h1>
      <div className="profile">
        <section aria-labelledby="details-h">
          <h2 id="details-h">{t('profile.details')}</h2>
          <form className="form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor="p-email">{t('auth.email')}</label>
              <input id="p-email" value={user.email} readOnly />
            </div>
            <div className="field">
              <label htmlFor="p-name">{t('auth.name')}</label>
              <input id="p-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="p-bio">{t('profile.bio')}</label>
              <textarea id="p-bio" rows="4" maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            {msg.text && <p className={msg.type === 'ok' ? 'success' : 'alert'} role={msg.type === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
            <p className="row">
              <button type="submit" className="btn btn--accent" disabled={busy}>{t('profile.save')}</button>
              <button type="button" className="btn btn--outline" onClick={logout}>{t('auth.logout')}</button>
            </p>
          </form>
        </section>
        <section aria-labelledby="orders-h" id="orders">
          <h2 id="orders-h">{t('profile.orders')}</h2>
          {orders.loading && <div className="skeleton skeleton--line" />}
          {orders.error && <Notice title={t('common.errorTitle')}>{t('common.errorText')}</Notice>}
          {orders.data && orders.data.length === 0 && <Notice title={t('profile.noOrdersTitle')} action={<Link to="/shop" className="btn btn--accent">{t('cart.continue')}</Link>}>{t('profile.noOrders')}</Notice>}
          {orders.data && orders.data.length > 0 && (
            <ul className="orders">
              {orders.data.map((o) => (
                <li key={o.id}>
                  <div className="orders__head">
                    <Link to={`/order/${o.id}`} className="link-accent"><strong>{t('order.number', { id: o.id })}</strong></Link>
                    <span>{date(o.created_at)}</span>
                    <span className="pill">{t(`order.status.${o.status}`)}</span>
                    <strong>{price(o.total)}</strong>
                  </div>
                  <p className="muted">{o.items.map((i) => `${i.title} × ${i.quantity}`).join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
