import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { errText, useTitle } from '../hooks.js';

export default function Login() {
  const { t } = useT();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const from = state?.from || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(t('auth.login'));

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError(t('auth.fillAll')); return; }
    setBusy(true); setError('');
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.status === 401 ? t('auth.badLogin') : errText(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="container page page--narrow">
      <div className="authbox">
        <p className="eyebrow">{t('auth.welcomeBack')}</p>
        <h1>{t('auth.login')}</h1>
        {state?.from && <p className="muted">{t('auth.loginToContinue')}</p>}
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={busy}>{busy ? t('common.wait') : t('auth.login')}</button>
        </form>
        <p className="authbox__alt">{t('auth.noAccount')} <Link to="/register" state={state} className="link-accent">{t('auth.register')}</Link></p>
      </div>
    </div>
  );
}
