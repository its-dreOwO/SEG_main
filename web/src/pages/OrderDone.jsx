import { Link, useLocation, useParams } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { useApi, useTitle } from '../hooks.js';
import { Notice } from '../components/Skeleton.jsx';
import NotFound from './NotFound.jsx';

export default function OrderDone() {
  const { id } = useParams();
  const { state } = useLocation();
  const { t, price, date } = useT();
  const { user, loading: authLoading } = useAuth();
  const fresh = state?.order && String(state.order.id) === id ? state.order : null;
  const { data, loading, error } = useApi(fresh || authLoading || !user ? null : `/orders/${encodeURIComponent(id)}`);
  const order = fresh || data;
  useTitle(t('order.title'));

  if (authLoading || loading) return <div className="container page page--narrow"><div className="skeleton skeleton--line" /></div>;
  if (!user && !fresh) return <div className="container page page--narrow"><Notice title={t('checkout.loginTitle')} action={<Link to="/login" state={{ from: `/order/${id}` }} className="btn btn--accent">{t('auth.login')}</Link>}>{t('order.loginText')}</Notice></div>;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container page page--narrow"><Notice title={t('common.errorTitle')}>{t('common.errorText')}</Notice></div>;
  if (!order) return null;

  return (
    <div className="container page page--narrow">
      <div className="done">
        <p className="eyebrow">{fresh ? t('order.thanks') : t('order.details')}</p>
        <h1>{fresh ? t('order.placed') : t('order.number', { id: order.id })}</h1>
        {fresh && <p>{t('order.placedText', { id: order.id })}</p>}
      </div>
      <dl className="meta meta--boxed">
        <div><dt>{t('order.number', { id: order.id })}</dt><dd>{date(order.created_at)}</dd></div>
        <div><dt>{t('order.status')}</dt><dd>{t(`order.status.${order.status}`)}</dd></div>
        <div><dt>{t('order.deliverTo')}</dt><dd>{order.customer_name}, {order.address}</dd></div>
        <div><dt>{t('checkout.payment')}</dt><dd>{t('checkout.cod')}</dd></div>
      </dl>
      <ul className="summary__items summary__items--lg">
        {order.items.map((i) => (
          <li key={i.document_id}><span>{i.title} × {i.quantity}</span><span>{price(Math.round(i.unit_price * 100) * i.quantity / 100)}</span></li>
        ))}
      </ul>
      <p className="summary__row summary__row--total"><span>{t('cart.total')}</span><strong>{price(order.total)}</strong></p>
      <p><Link to="/shop" className="btn btn--accent">{t('cart.continue')}</Link> <Link to="/profile#orders" className="btn btn--outline">{t('footer.orders')}</Link></p>
    </div>
  );
}
