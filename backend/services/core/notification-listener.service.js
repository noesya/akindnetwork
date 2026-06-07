'use strict';

const { TripleStoreAdapter } = require('@semapps/triplestore');
const { NotificationsListenerService } = require('@semapps/solid');

/**
 * Solid notifications listener. PodActivitiesWatcher waits for this service.
 * It receives Linked Data Notifications (LDN) from Pod Providers to know when
 * something happens in a user's inbox we should react to.
 */
module.exports = {
  mixins: [NotificationsListenerService],
  adapter: new TripleStoreAdapter({
    type: 'WebhookChannelListener',
    dataset: process.env.AUTH_ACCOUNTS_DATASET_NAME || 'settings'
  }),
  settings: {
    baseUrl: process.env.APP_BASE_URL
  }
};
