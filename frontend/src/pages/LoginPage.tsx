import { useEffect, useState, type FormEvent } from 'react';
import { useLogin, useLogout, useNotify } from 'ra-core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import jwtDecode from 'jwt-decode';
import { DEFAULT_POD_PROVIDER, isAuthConfigured } from '../providers/setup';
import { useRegisterApp } from '../providers/useRegisterApp';

const CLIENT_ID =
  import.meta.env.VITE_OIDC_CLIENT_ID ??
  `${import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org'}/app`;

/**
 * Three modes:
 *   1. Plain `/login` — show the Pod Provider picker. Submitting kicks off
 *      Solid-OIDC; the user lands on `/auth-callback` after authentication.
 *   2. `/login?register_app=true` — the Pod Provider's redirect target after
 *      the SAI consent screen. We re-run `registerApp` which now finds the
 *      freshly-created `ApplicationRegistration` and we navigate home.
 *   3. `/login?logout=true` — declared as `oidc:post_logout_redirect_uris`
 *      in the app descriptor; clear local session and bounce home.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const logout = useLogout();
  const notify = useNotify();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const registerApp = useRegisterApp();
  const [issuer, setIssuer] = useState(DEFAULT_POD_PROVIDER);
  const [busy, setBusy] = useState(false);

  // Handle the two callback variants. Run once on mount — the search params
  // don't change during the lifetime of this page (any new query goes through
  // a new mount because we always full-reload via `window.location.href`).
  useEffect(() => {
    if (searchParams.has('logout')) {
      logout(undefined, '/', false);
      return;
    }
    if (searchParams.has('register_app')) {
      const token = localStorage.getItem('token');
      if (!token) {
        notify('login.error', { type: 'error' });
        return;
      }
      const payload = jwtDecode<{ webid?: string; webId?: string }>(token) as any;
      const webId = payload.webid || payload.webId;
      if (!webId) return;
      registerApp(CLIENT_ID, webId)
        .then(uri => {
          if (uri) {
            const redirect = localStorage.getItem('redirect') || '/';
            localStorage.removeItem('redirect');
            navigate(redirect, { replace: true });
          }
        })
        .catch(err => notify(err.message || 'Registration failed', { type: 'error' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (searchParams.has('register_app')) {
    return (
      <div className="login">
        <p className="login__hint">{t('login.finishing')}</p>
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
