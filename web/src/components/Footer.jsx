import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { Logo } from './Icons.jsx';

export default function Footer() {
  const { t, pick, categories } = useT();
  const { user } = useAuth();
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link to="/" className="logo" aria-label={t('header.home')}><Logo /><span>Volt</span></Link>
          <address>
            <p><strong>{t('footer.address')}:</strong> {t('footer.addressValue')}</p>
            <p><strong>{t('footer.call')}:</strong> <a href="tel:+842873001234">+84 28 7300 1234</a></p>
            <p><strong>{t('footer.email')}:</strong> <a href="mailto:hello@volt.example">hello@volt.example</a></p>
          </address>
        </div>
        <nav aria-label={t('footer.shop')}>
          <h2 className="footer-h">{t('footer.shop')}</h2>
          <ul>
            {categories.slice(0, 6).map((c) => <li key={c.id}><Link to={`/shop?category=${c.slug}`}>{pick(c, 'name')}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label={t('footer.browse')}>
          <h2 className="footer-h">{t('footer.browse')}</h2>
          <ul>
            <li><Link to="/shop?sort=newest">{t('nav.newArrivals')}</Link></li>
            <li><Link to="/shop?sort=views">{t('nav.trending')}</Link></li>
            <li><Link to="/shop?sort=top">{t('nav.topSelling')}</Link></li>
            <li><Link to="/search">{t('footer.search')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.account')}>
          <h2 className="footer-h">{t('footer.account')}</h2>
          <ul>
            {user
              ? <><li><Link to="/profile">{t('footer.profile')}</Link></li><li><Link to="/profile#orders">{t('footer.orders')}</Link></li></>
              : <><li><Link to="/login">{t('auth.login')}</Link></li><li><Link to="/register">{t('auth.register')}</Link></li></>}
            <li><Link to="/cart">{t('footer.cart')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="container footer-bottom">
        <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
        <p>{t('footer.cod')}</p>
      </div>
    </footer>
  );
}
