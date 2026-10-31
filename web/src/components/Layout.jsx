import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import { useT } from '../i18n.jsx';
import { usePageTransition } from '../motion/index.js';

export default function Layout() {
  const { t } = useT();
  const { pathname, hash } = useLocation();
  const mainRef = usePageTransition(pathname);
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <>
      <a className="skip-link" href="#main">{t('common.skip')}</a>
      <Header />
      <main id="main" tabIndex={-1} ref={mainRef}><Outlet /></main>
      <Footer />
    </>
  );
}
