import { useEffect, useState } from 'react';
import { useAuthProvider } from 'ra-core';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import jwtDecode from 'jwt-decode';
import { useRegisterApp } from '../providers/useRegisterApp';

/**
 * Lands after the Solid-OIDC provider redirects back to us with a code.
 *
 * Two-step process:
 *   1. `authProvider.handleCallback()` — exchanges the OIDC code for a JWT
 *      and stores it in localStorage. After this we know who the user is.
 *   2. `registerApp(clientId, webId)` — checks whether the user already
 *      granted SAI consent to this app. If yes, returns the existing
 *      `ApplicationRegistration` URI and we navigate to the user's intended
 *      destination. If not, it redirects the browser to the Pod Provider's
 *      authorization endpoint where the user sees the consent screen; on
 *      accept they're sent back to `/login?register_app=true` which finalises
 *      the registration. Either way this component stops navigating itself.
 */
export default function AuthCallbackPage() {
  const authProvider = useAuthProvider();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const registerApp = useRegisterApp();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await (authProvider as any)?.handleCallback?.();
        if (cancelled) return;

        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token after callback');
        const { webid } = jwtDecode<{ webid?: string; webId?: string }>(token) as any;
        const webId = webid || (jwtDecode as any)(token).webId;
        if (!webId) throw new Error('Token has no webid claim');

        // Backend's app actor URL — Solid-OIDC client id + SAI Application URI.
        const clientId =
          import.meta.env.VITE_OIDC_CLIENT_ID ??
          `${import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org'}/app`;

        const registrationUri = await registerApp(clientId, webId);
        if (cancelled) return;

        if (registrationUri) {
          // Already consented → resume where we left off.
          const redirect = localStorage.getItem('redirect') || '/';
          localStorage.removeItem('redirect');
          navigate(redirect, { replace: true });
        }
        // else: registerApp() already triggered window.location.href to the
        // auth-agent's consent endpoint; nothing more to do here.
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Callback failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authProvider, navigate, registerApp]);

  return (
    <div className="login">
      {error ? (
        <>
          <h1 className="login__title">{t('login.error')}</h1>
          <p>{error}</p>
        </>
      ) : (
        <p className="login__hint">{t('login.finishing')}</p>
      )}
    </div>
  );
}
