import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { errText, useTitle } from '../hooks.js';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export default function Register() {
  const { t } = useT();
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const from = state?.from || '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(t('auth.register'));

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length > 80) { setError(t('auth.nameInvalid')); return; }
    if (!EMAIL_RE.test(email.trim())) { setError(t('auth.emailInvalid')); return; }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError(t('auth.passwordInvalid')); return; }
    setBusy(true); setError('');
    try {
      await register(name.trim(), email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.status === 409 ? t('auth.emailTaken') : errText(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="container page page--narrow">
      <div className="authbox">
        <p className="eyebrow">{t('auth.joinUs')}</p>
        <h1>{t('auth.register')}</h1>
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="name">{t('auth.name')}</label>
            <input id="name" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-describedby="pw-hint" />
            <small id="pw-hint" className="muted">{t('auth.passwordHint')}</small>
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={busy}>{busy ? t('common.wait') : t('auth.createAccount')}</button>
        </form>
        <p className="authbox__alt">{t('auth.haveAccount')} <Link to="/login" state={state} className="link-accent">{t('auth.login')}</Link></p>
      </div>
    </div>
  );
}
