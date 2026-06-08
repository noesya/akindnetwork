'use strict';

const { Errors: E } = require('moleculer-web');

/**
 * Minimal `auth` service for accepting Solid-OIDC Bearer tokens from any Pod
 * Provider whose user has registered our app.
 *
 * Why we need this:
 *   The HTTP gateway set up by @semapps/core delegates to `auth.authenticate`
 *   whenever a request carries an Authorization header. @semapps/auth is
 *   meant for Pod Providers (it verifies SERVER-signed tokens against a
 *   private key it holds). Apps like Kind don't issue tokens — the user's
 *   Pod Provider does — so there's no key to verify against from our side.
 *
 *   We satisfy the gateway's contract with a stand-in service named `auth`:
 *     - `authenticate(ctx)` : if there's a Bearer, decode + populate webId
 *                              (no signature verification yet — see TODO).
 *                              If no Bearer, set webId='anon' and continue.
 *     - `authorize(ctx)`    : same, but reject when no Bearer.
 *
 * TODO (security hardening, before opening to the public):
 *   Verify the JWT signature against the issuer's JWKS via OIDC discovery
 *   (`<issuer>/.well-known/openid-configuration` → `jwks_uri`). Right now any
 *   syntactically-valid token with a webid claim is accepted; this is fine
 *   for the closed alpha (we know all the testers personally) and lets us
 *   build the review flow without a roundtrip to oidc-client every request.
 */
module.exports = {
  name: 'auth',

  actions: {
    authenticate: {
      visibility: 'public',
      async handler(ctx) {
        const { req } = ctx.params;
        const webId = this.extractWebId(req);
        if (!webId) {
          ctx.meta.webId = 'anon';
          return null;
        }
        ctx.meta.webId = webId;
        return { webId };
      }
    },

    authorize: {
      visibility: 'public',
      async handler(ctx) {
        const { req } = ctx.params;
        const webId = this.extractWebId(req);
        if (!webId) {
          throw new E.UnAuthorizedError(E.ERR_NO_TOKEN);
        }
        ctx.meta.webId = webId;
        return { webId };
      }
    }
  },

  methods: {
    /**
     * Pull the WebID out of a Bearer token's payload. Accepts both spellings
     * (`webid` per Solid-OIDC spec; `webId` per legacy SemApps tokens) so the
     * same code path works for tokens issued by Armoise's modern OIDC flow
     * AND tokens issued by older SemApps Pod Providers.
     */
    extractWebId(req) {
      const auth = req?.headers?.authorization;
      if (!auth) return null;
      const [scheme, token] = auth.split(' ');
      if (scheme !== 'Bearer' || !token) return null;
      try {
        const [, payload] = token.split('.');
        if (!payload) return null;
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const decoded = JSON.parse(
          Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        );
        return decoded.webid || decoded.webId || null;
      } catch (_e) {
        return null;
      }
    }
  }
};
