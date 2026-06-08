// SAI (Solid Application Interoperability) consent-trigger hook.
//
// Replicates the `useRegisterApp` logic of `@activitypods/react` (which is
// internal, not exported). Kept as our own copy because we use a custom Figma
// LoginPage rather than the MUI one shipped with that package.
//
// Spec: https://solid.github.io/data-interoperability-panel/specification/#authorization-agent
//
// The flow:
//   1. Read the user's WebID document → find `interop:hasAuthorizationAgent`.
//   2. HEAD the auth-agent URI → look for `Link: rel="registeredAgent"`.
//      → If present: an `ApplicationRegistration` already exists for this app.
//        Return its URI. The caller can proceed to the app.
//      → If absent : the user has never granted consent to this app. We redirect
//        them to the auth-agent's `interop:hasAuthorizationRedirectEndpoint`
//        with our `client_id`, which is where the Pod Provider shows its
//        consent UI. After accept/deny, the provider redirects to the URL
//        declared in our app descriptor's `interop:hasAuthorizationCallback­Endpoint`
//        (i.e. `/login?register_app=true`), where we'll call this hook again.
//
// Throws if the user's WebID has no auth-agent — the Pod Provider hasn't
// initialised SAI machinery for that user; nothing the app can do about it.

import { useCallback } from 'react';
import { useDataProvider } from 'ra-core';
import parseLinkHeader from 'http-link-header';

type RegisterFn = (clientId: string, webId: string) => Promise<string | undefined>;

export function useRegisterApp(): RegisterFn {
  const dataProvider = useDataProvider();

  return useCallback<RegisterFn>(
    async (clientId, webId) => {
      const { json: actor } = await (dataProvider as any).fetch(webId);
      const authAgentUri: string | undefined = actor['interop:hasAuthorizationAgent'];
      if (!authAgentUri) {
        throw new Error('apods.error.user_authorization_agent_not_found');
      }

      // The auth-agent endpoint responds with a Link header advertising any
      // existing registration via `rel=http://www.w3.org/ns/solid/interop#registeredAgent`.
      const { headers, json: authAgent } = await (dataProvider as any).fetch(authAgentUri);
      const linkHeader = parseLinkHeader.parse(headers.get('Link') || '');
      const registered = linkHeader.rel('http://www.w3.org/ns/solid/interop#registeredAgent');
      if (registered.length > 0) {
        return registered[0].anchor; // ApplicationRegistration URI
      }

      // No existing registration → ask the user for consent. Remember the page
      // we were on so the post-consent callback can resume there.
      localStorage.setItem('redirect', window.location.pathname);
      const redirectToAuthAgentUrl = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
      redirectToAuthAgentUrl.searchParams.append('client_id', clientId);
      window.location.href = redirectToAuthAgentUrl.toString();
      return undefined;
    },
    [dataProvider]
  );
}
