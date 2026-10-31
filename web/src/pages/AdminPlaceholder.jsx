import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useTitle } from '../hooks.js';

export default function AdminPlaceholder() {
  const { t } = useT();
  useTitle(t('admin.title'));
  return (
    <div className="container page page--narrow center">
      <p className="eyebrow">{t('admin.eyebrow')}</p>
      <h1>{t('admin.title')}</h1>
      <p>{t('admin.text')}</p>
      <p><Link to="/" className="btn btn--accent">{t('notfound.home')}</Link></p>
    </div>
  );
}
