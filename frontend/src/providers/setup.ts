// Provider wiring for Kind — aligned with activitypods/app-boilerplate.
//
// Key decisions:
//  - `clientId` is the URL of our BACKEND's app actor (= the SAI Application
//    Profile with access needs), NOT the frontend's /client-id.jsonld. Pod
//    Providers fetch this URL to build the consent screen. Without it pointing
//    at the right place, no consent ever shows.
//  - Resources are declared by their PUBLIC ShapeTree URL — the same trees
//    referenced in backend/services/app.service.js accessNeeds. The data
//    provider uses these to discover containers in the user's Pod at runtime.
//  - The two plugins `configureUserStorage` and `fetchAppRegistration` are
//    what enable dynamic per-user container discovery after auth. Without them
//    we'd need to hardcode `dataServers` + `containers`, which doesn't scale
//    beyond a single Pod Provider.

import type { AuthProvider } from 'ra-core';
import {
  dataProvider as buildDataProvider,
  configureUserStorage,
  fetchAppRegistration
} from '@semapps/semantic-data-provider';
import { authProvider as buildAuthProvider } from '@semapps/auth-provider';

export const DEFAULT_POD_PROVIDER =
  import.meta.env.VITE_DEFAULT_POD_PROVIDER ?? 'https://armoise.co';

const BACKEND_URL =
  import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org';

// Solid-OIDC client identifier — points at the backend app actor exposed by
// @activitypods/app's AppService. That URL contains the full SAI manifest
// (access needs, app metadata) the Pod Provider needs for the consent screen.
const CLIENT_ID =
  import.meta.env.VITE_OIDC_CLIENT_ID ?? `${BACKEND_URL}/app`;

export const isAuthConfigured = Boolean(import.meta.env.VITE_FRONTEND_URL);

const backendOrigin = new URL(BACKEND_URL).origin;

// JSON-LD context for the data provider — array form, with AS2 first and the
// app's own context fetched from the backend. Same pattern as the boilerplate.
const jsonContext = [
  'https://www.w3.org/ns/activitystreams',
  `${backendOrigin}/.well-known/context.jsonld`
];

// Resources mapped to ShapeTrees, NOT container paths. The data provider's
// plugins (configureUserStorage + fetchAppRegistration) figure out which
// container in the user's Pod hosts each shape at runtime, after login.
const resources = {
  Letter: {
    shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Note'
  },
  Profile: {
    shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Profile'
  }
};

export const dataProvider = buildDataProvider({
  resources,
  jsonContext,
  returnFailedResources: true,
  plugins: [configureUserStorage(), fetchAppRegistration()]
} as any);

// Stub authProvider used when auth isn't configured (demo mode). Keeps the
// app rendering with mock data instead of crashing on missing env.
const stubAuthProvider: AuthProvider = {
  login: async () => {
    throw new Error('Auth not configured. Set VITE_FRONTEND_URL in .env.');
  },
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getIdentity: async () => ({ id: '' }),
  getPermissions: async () => null
};

export const authProvider: AuthProvider = isAuthConfigured
  ? (buildAuthProvider({
      dataProvider,
      authType: 'solid-oidc',
      clientId: CLIENT_ID,
      checkPermissions: true,
      allowAnonymous: true,
      checkUser: () => true
    }) as unknown as AuthProvider)
  : stubAuthProvider;
