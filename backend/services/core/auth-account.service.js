'use strict';

const { AuthAccountService } = require('@semapps/auth');
const { TripleStoreAdapter } = require('@semapps/triplestore');

/**
 * Minimal auth-account service. AppService waits for `auth.account` before
 * it can finish booting (WebFinger lookups depend on it). We import only the
 * `AuthAccountService` sub-piece, not the full @semapps/auth — full auth is
 * the Pod Provider's job, not ours.
 */
module.exports = {
  mixins: [AuthAccountService],
  adapter: new TripleStoreAdapter({
    type: 'AuthAccount',
    dataset: process.env.AUTH_ACCOUNTS_DATASET_NAME || 'settings'
  })
};
