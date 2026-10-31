import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import { useAuth } from '../auth.jsx';
import { CartIcon, ChevronDown, CloseIcon, HeadsetIcon, Logo, MenuIcon, SearchIcon, UserIcon } from './Icons.jsx';

const PHONE = '+84 28 7300 1234';

function LangSwitch() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      <button type="button" className={lang === 'en' ? 'is-on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN · USD</button>
      <button type="button" className={lang === 'vi' ? 'is-on' : ''} aria-pressed={lang === 'vi'} onClick={() => setLang('vi')}>VI · VND</button>
    </div>
  );
}

function SearchForm() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const loc = useLocation();
  const [q, setQ] = useState('');
  useEffect(() => { setQ(loc.pathname === '/search' ? params.get('q') || '' : ''); }, [loc.pathname, params]);
  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };
  return (
    <form className="searchbar" role="search" onSubmit={submit}>
      <label htmlFor="site-search" className="sr-only">{t('header.searchLabel')}</label>
      <SearchIcon size={18} />
      <input id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('header.searchPlaceholder')} autoComplete="off" />
      <button type="submit" className="sr-only">{t('header.search')}</button>
    </form>
  );
}

export default function Header() {
  const { t, pick, categories, settings } = useT();
  const { count } = useCart();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [cats, setCats] = useState(false);
  const catRef = useRef(null);
  const loc = useLocation();

  useEffect(() => { setMenu(false); setCats(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!cats) return undefined;
    const onDown = (e) => { if (catRef.current && !catRef.current.contains(e.target)) setCats(false); };
    const onKey = (e) => { if (e.key === 'Escape') setCats(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [cats]);

  return (
    <header className="site-header">
      <div className="topbar">
        <div className="container topbar__in">
          <p className="topbar__msg">{settings.banner || t('header.defaultBanner')}</p>
          <LangSwitch />
        </div>
      </div>
      <div className="container header-main">
        <button type="button" className="icon-btn menu-btn" aria-expanded={menu} aria-controls="site-nav" onClick={() => setMenu((m) => !m)}
          aria-label={menu ? t('header.closeMenu') : t('header.openMenu')}>
          {menu ? <CloseIcon /> : <MenuIcon />}
        </button>
        <Link to="/" className="logo" aria-label={t('header.home')}><Logo /><span>{settings.storeName || 'Volt'}</span></Link>
        <a className="callus" href={`tel:${PHONE.replaceAll(' ', '')}`}>
          <HeadsetIcon size={26} />
          <span><small>{t('header.callUs')}</small><strong>{PHONE}</strong></span>
        </a>
        <SearchForm />
        <div className="header-icons">
          <Link to={user ? '/profile' : '/login'} className="icon-link" aria-label={user ? t('header.account') : t('header.login')}>
            <UserIcon /><span className="icon-link__text">{user ? user.display_name.split(' ')[0] : t('header.login')}</span>
          </Link>
          {user?.permissions?.length > 0 && <Link to="/admin" className="icon-link"><span className="icon-link__text">{t('header.admin')}</span></Link>}
          <Link to="/cart" className="icon-link" aria-label={t('header.cart', { n: count })}>
            <CartIcon /><span className="cart-count" data-cart-count>{count}</span>
          </Link>
        </div>
      </div>
      <div className={`navrow ${menu ? 'is-open' : ''}`} id="site-nav">
        <div className="container navrow__in">
          <div className="allcats" ref={catRef}>
            <button type="button" className="allcats__btn" aria-expanded={cats} aria-controls="allcats-menu" onClick={() => setCats((c) => !c)}>
              <MenuIcon size={18} /> {t('nav.allCategories')} <ChevronDown size={16} />
            </button>
            {cats && (
              <ul className="allcats__menu" id="allcats-menu">
                <li><Link to="/shop">{t('nav.allProducts')}</Link></li>
                {categories.map((c) => <li key={c.id}><Link to={`/shop?category=${c.slug}`}>{pick(c, 'name')}</Link></li>)}
              </ul>
            )}
          </div>
          <nav className="mainnav" aria-label={t('nav.main')}>
            <NavLink to="/" end>{t('nav.home')}</NavLink>
            <NavLink to="/shop" end>{t('nav.shop')}</NavLink>
            <Link to="/shop?sort=newest">{t('nav.newArrivals')}</Link>
            <Link to="/shop?sort=views">{t('nav.trending')}</Link>
            <Link to="/shop?sort=top">{t('nav.topSelling')}</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
