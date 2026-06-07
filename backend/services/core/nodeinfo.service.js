'use strict';

const urlJoin = require('url-join');
const { NodeinfoService } = require('@semapps/nodeinfo');
const pkg = require('../../package.json');

/**
 * Exposes /.well-known/nodeinfo — standard endpoint for Fediverse discovery
 * tools. Not strictly required to boot, but conventional.
 */
module.exports = {
  mixins: [NodeinfoService],
  settings: {
    baseUrl: process.env.APP_BASE_URL,
    software: {
      name: 'kind',
      version: pkg.version,
      repository: 'https://github.com/noesya/akindnetwork',
      homepage: process.env.APP_FRONT_URL || 'https://akindnetwork.org'
    },
    protocols: ['activitypub'],
    metadata: {
      frontend_url: process.env.APP_FRONT_URL,
      login_url: process.env.APP_FRONT_URL && urlJoin(process.env.APP_FRONT_URL, 'login'),
      logout_url: process.env.APP_FRONT_URL && urlJoin(process.env.APP_FRONT_URL, 'login?logout=true'),
      resource_url: process.env.APP_FRONT_URL && urlJoin(process.env.APP_FRONT_URL, 'r')
    }
  },
  actions: {
    async getUsersCount(ctx) {
      const appRegistrations = await ctx.call('app-registrations.list');
      const count = appRegistrations['ldp:contains']?.length || 0;
      return { total: count, activeHalfYear: count, activeMonth: count };
    }
  }
};
