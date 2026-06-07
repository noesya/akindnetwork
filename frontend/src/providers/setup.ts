// Provider wiring: a single source of truth for which Pod Provider we talk to
// and how data flows in and out of it.
//
// In v0 we use SemApps' standard semantic-data + auth providers, configured
// against armoise.co by default. The user can point Kind at any compatible
// Pod Provider by entering their own WebID at /login.
//
// We deliberately do NOT bring in react-admin (the UI library) — only ra-core,
// which gives us the AdminContext + the data/auth hooks (useGetOne,
// useGetList, useLogin, useGetIdentity, ...). The visual layer stays ours.

import type { AuthProvider } from 'ra-core';
import { dataProvider as buildDataProvider } from '@semapps/semantic-data-provider';
import { authProvider as buildAuthProvider } from '@semapps/auth-provider';

export const DEFAULT_POD_PROVIDER =
  import.meta.env.VITE_DEFAULT_POD_PROVIDER ?? 'https://armoise.co';

// ---------------------------------------------------------------------------
// Ontologies known to the data provider.
//
// Only the bits Kind needs are listed here. Adding a new predicate ? declare
// the prefix once and use prefixed names everywhere downstream.
// ---------------------------------------------------------------------------
const ontologies = [
  { prefix: 'as', url: 'https://www.w3.org/ns/activitystreams#' },
  { prefix: 'dc', url: 'http://purl.org/dc/terms/' },
  { prefix: 'schema', url: 'http://schema.org/' },
  { prefix: 'foaf', url: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'skos', url: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'acl', url: 'http://www.w3.org/ns/auth/acl#' },
  { prefix: 'kind', url: 'https://kind.app/ns#' }
];

// ---------------------------------------------------------------------------
// Resources the app knows how to read. Mapped onto LDP containers in the
// user's Pod.
// ---------------------------------------------------------------------------
const resources = {
  Letter: {
    types: ['as:Article', 'kind:Letter'],
    containerUri: '/data/kind/letters/',
    forceArray: ['kind:approvedBy', 'kind:sources', 'as:to']
  },
  Source: {
    types: ['kind:Source'],
    containerUri: '/data/kind/sources/'
  },
  Circle: {
    types: ['kind:Circle'],
    containerUri: '/data/kind/circles/'
  },
  Person: {
    types: ['foaf:Person'],
    containerUri: '/profile/'
  }
};

// ---------------------------------------------------------------------------
// The data servers our app federates with. The keyed object lets the provider
// route requests by server. We start with armoise; user-provided WebIDs from
// other providers will be added dynamically by the auth provider.
// ---------------------------------------------------------------------------
// SemApps expects `containers` as an *array* of `{ uri, types }` objects, NOT
// the nested-by-server-key shape from older versions. The find/forEach calls
// in semantic-data-provider's helpers iterate this array.
const containers = Object.values(resources).map((r) => ({
  uri: r.containerUri,
  types: r.types
}));

const dataServers: Record<string, any> = {
  armoise: {
    name: 'Armoise',
    baseUrl: DEFAULT_POD_PROVIDER,
    sparqlEndpoint: `${DEFAULT_POD_PROVIDER}/sparql`,
    default: true,
    pod: true,
    containers
  }
};

// SemApps' Configuration type marks `httpClient` and `plugins` as required.
// `httpClient` defaults to fetch internally when omitted, but `plugins` is
// iterated unconditionally at runtime — passing `undefined` throws
// `TypeError: plugins is not iterable` from inside SemApps. Always pass [].
export const dataProvider = buildDataProvider({
  dataServers,
  ontologies,
  resources,
  plugins: [],
  jsonContext: ontologies.reduce<Record<string, string>>(
    (acc, o) => ((acc[o.prefix] = o.url), acc),
    {}
  )
} as any);

// Solid-OIDC client identifier — a public URL pointing to our app's metadata.
// In dev we leave it unset (or set it via .env), in which case the app stays
// in "anonymous mode" and falls back to mock data. When set, the login flow
// becomes functional.
const CLIENT_ID =
  import.meta.env.VITE_OIDC_CLIENT_ID ??
  (import.meta.env.VITE_FRONTEND_URL
    ? `${import.meta.env.VITE_FRONTEND_URL}/client-id.jsonld`
    : undefined);

export const isAuthConfigured = Boolean(CLIENT_ID);

// authProvider needs a reference back to the data provider so it can resolve
// a WebID to its host Pod Provider before redirecting to OIDC.
//
// We use solid-oidc, which is the standard for ActivityPods 2.x. When no
// CLIENT_ID is set (the default in `npm run dev` without a tunnel), SemApps'
// authProvider would throw on construction, so we substitute a no-op stub
// that keeps the app in anonymous (mock-data) mode.
const stubAuthProvider: AuthProvider = {
  login: async () => {
    throw new Error('Auth not configured. Set VITE_FRONTEND_URL in .env.');
  },
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  // Anonymous identity — kept loose because ra-core's UserIdentity requires an
  // id, but the mock fallback in useCurrentUser intercepts before that ever
  // matters at the UI level.
  getIdentity: async () => ({ id: '' }),
  getPermissions: async () => null
};

export const authProvider: AuthProvider = isAuthConfigured
  ? (buildAuthProvider({
      dataProvider,
      authType: 'solid-oidc',
      clientId: CLIENT_ID,
      allowAnonymous: true,
      checkUser: () => true
    }) as unknown as AuthProvider)
  : stubAuthProvider;
