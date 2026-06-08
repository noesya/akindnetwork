import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import jwtDecode from 'jwt-decode';
import { useRegisterApp } from '../providers/useRegisterApp';
import { isAuthConfigured } from '../providers/setup';

const CLIENT_ID =
  import.meta.env.VITE_OIDC_CLIENT_ID ??
  `${import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org'}/app`;

// Routes that should NOT trigger the registration check (we'd otherwise enter
// a redirect loop on the consent callback, or interfere with the OIDC code
// exchange that the login flow performs).
const SKIP_PATHS = new Set(['/login', '/auth-callback']);

/**
 * SAI boot-time guard.
 *
 * Runs once when the SPA mounts. If the user is already logged in (a JWT
 * sits in localStorage from a previous session) but the app's
 * `ApplicationRegistration` doesn't exist yet on their Pod, we still need to
 * walk them through the consent screen — otherwise the data provider has no
 * containers to read from and the app silently breaks.
 *
 * Without this guard, the consent dance only fires on the freshly-minted
 * `/auth-callback` path, which a returning user with a stale token never
 * visits.
 *
 * If a registration already exists, `registerApp` returns the URI and we do
 * nothing. If it doesn't, `registerApp` redirects the browser to the auth
 * agent's consent endpoint — no further code from this component runs.
 */
export default function RegistrationGuard() {
  const location = useLocation();
  const registerApp = useRegisterApp();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isAuthConfigured) return;
    if (ranRef.current) return;
    if (SKIP_PATHS.has(location.pathname)) return;

    const token = localStorage.getItem('token');
    if (!token) return; // anonymous visitor — nothing to register

    let payload: any;
    try {
      payload = jwtDecode(token);
    } catch {
      // corrupt token — drop it so the user goes back through login
      localStorage.removeItem('token');
      return;
    }
    const webId: string | undefined = payload?.webid || payload?.webId;
    if (!webId) return;

    ranRef.current = true;
    registerApp(CLIENT_ID, webId).catch(err => {
      // Most likely cause: the Pod's WebID has no `interop:hasAuthorizationAgent`
      // (Pod Provider hasn't initialised SAI for this user). Nothing we can do
      // from the app side — log it but don't crash the boot.
      console.warn('[RegistrationGuard] could not register app:', err);
    });
  }, [location.pathname, registerApp]);

  return null;
}
