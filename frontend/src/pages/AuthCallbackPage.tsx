import { useEffect, useState } from 'react';
import { useAuthProvider } from 'ra-core';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Lands after the Solid-OIDC provider redirects back to us with a code.
 * Delegates the code-exchange to SemApps' authProvider.handleCallback then
 * pushes the user to wherever they intended to go (stored in localStorage by
 * the login step), defaulting to `/`.
 */
export default function AuthCallbackPage() {
  const authProvider = useAuthProvider();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // handleCallback is provided by SemApps' authProvider for solid-oidc.
        // Cast is needed because ra-core's AuthProvider type is permissive.
        await (authProvider as any)?.handleCallback?.();
        if (cancelled) return;
        const redirect = localStorage.getItem('redirect') || '/';
        localStorage.removeItem('redirect');
        navigate(redirect, { replace: true });
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Callback failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authProvider, navigate]);

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
