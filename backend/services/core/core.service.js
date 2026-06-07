'use strict';

const { CoreService } = require('@activitypods/app');

/**
 * Core service — registers the `kind:` ontology and bootstraps shape trees.
 *
 * The AppService mixin expects a CoreService dependency that owns these
 * cross-cutting registrations. Keeping them here means the rest of the
 * services don't have to know about ontology plumbing.
 */
module.exports = {
  name: 'core',
  mixins: [CoreService],

  settings: {
    baseUrl: process.env.APP_BASE_URL,
    baseDir: __dirname + '/..',

    // Ontology declarations — added to the @semapps/ontologies registry on boot.
    // Order matters: more specific prefixes last.
    ontologies: [
      {
        prefix: 'kind',
        url: 'https://kind.app/ns#',
        owl: __dirname + '/../../ontologies/kind.ttl'
      }
    ],

    // Shape trees served from /shapetrees/<name>.
    // Their URIs are referenced by the AppService accessNeeds.
    shapeTreesDir: __dirname + '/../../shapetrees'
  }
};
