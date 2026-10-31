import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';

export default function NotFound() {
  const { t } = useT();
  useTitle(t('notfound.title'));
  return (
    <div className="container page page--narrow center">
      <p className="eyebrow">404</p>
      <h1>{t('notfound.title')}</h1>
      <p>{t('notfound.text')}</p>
      <p><Link to="/" className="btn btn--accent">{t('notfound.home')}</Link> <Link to="/shop" className="btn btn--outline">{t('notfound.shop')}</Link></p>
    </div>
  );
}
