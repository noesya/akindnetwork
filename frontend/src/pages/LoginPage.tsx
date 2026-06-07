import { useState, type FormEvent } from 'react';
import { useLogin, useNotify } from 'ra-core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_POD_PROVIDER, isAuthConfigured } from '../providers/setup';

export default function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const notify = useNotify();
  const navigate = useNavigate();
  const [issuer, setIssuer] = useState(DEFAULT_POD_PROVIDER);
  const [busy, setBusy] = useState(false);

  if (!isAuthConfigured) {
    return (
      <div className="login">
        <h1 className="login__title">{t('login.title')}</h1>
        <p className="login__hint">{t('login.unconfigured')}</p>
        <pre className="login__code">
{`# .env
VITE_FRONTEND_URL=https://your-tunnel.ngrok.app`}
        </pre>
        <Link to="/" className="btn">
          ← {t('login.back')}
        </Link>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Passing `issuer` rather than `webId` lets the user pick a Pod Provider
      // without typing a full WebID. Solid-OIDC handles the discovery.
      await login({ issuer, redirect: '/' });
    } catch (err: any) {
      notify(err.message || 'Login failed', { type: 'error' });
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <h1 className="login__title">{t('login.title')}</h1>
      <p className="login__hint">{t('login.hint')}</p>
      <form onSubmit={submit} className="login__form">
        <label className="login__label" htmlFor="issuer">
          {t('login.podProvider')}
        </label>
        <input
          id="issuer"
          className="login__input"
          type="url"
          required
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder="https://armoise.co"
        />
        <div className="login__actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t('login.connecting') : t('login.connect')}
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => navigate('/')}>
            {t('login.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
