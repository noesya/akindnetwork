'use strict';

const { AppService } = require('@activitypods/app');

/**
 * Kind — application service.
 *
 * Aligned with activitypods/app-boilerplate (the canonical reference) for SAI
 * compatibility. Three things matter here:
 *
 *  1. Shape trees are referenced by RESOLVABLE URLs. Pod Providers fetch them
 *     during the consent screen, so unreachable URIs break the install flow.
 *     We use the public shape repository at shapes.activitypods.org while we
 *     bootstrap; later we'll host our own at api.akindnetwork.org and migrate.
 *
 *  2. We do NOT set `name: 'app'` ourselves — let the mixin own that, so the
 *     actor URI stays at <baseUrl>/app (and not /app12345 from prior collisions).
 *
 *  3. Permission tokens use the modern `apods:CreateWacGroup` / `Collection` /
 *     `QuerySparqlEndpoint` names, not the deprecated CreateAclGroup.
 */
module.exports = {
  mixins: [AppService],
  settings: {
    baseUrl: process.env.APP_BASE_URL,
    app: {
      name: 'A kind network',
      description: 'Peer-reviewed, federated, post-growth',
      thumbnail: `${process.env.APP_FRONT_URL || ''}/images/logo192.png`,
      frontUrl: process.env.APP_FRONT_URL,
      supportedLocales: ['fr', 'en']
    },
    oidc: {
      clientUri: process.env.APP_FRONT_URL,
      redirectUris: `${process.env.APP_FRONT_URL}/auth-callback`,
      postLogoutRedirectUris: `${process.env.APP_FRONT_URL}/login?logout=true`,
      tosUri: null
    },
    accessNeeds: {
      required: [
        // Letters are long-form notes — until we host our own kind:Letter
        // shape tree, we reuse the public as:Note shape from the canonical
        // ActivityPods shape repository.
        {
          shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Note',
          accessMode: ['acl:Read', 'acl:Write']
        },
        // Read access to user profiles (other peers when displaying letters).
        {
          shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Profile',
          accessMode: 'acl:Read'
        },
        // Inbox/outbox for federated letter delivery.
        'apods:ReadInbox',
        'apods:ReadOutbox',
        'apods:PostOutbox',
        // SPARQL queries against the user's Pod (used by data provider).
        'apods:QuerySparqlEndpoint',
        // WAC groups back the Kind interest circles.
        'apods:CreateWacGroup',
        // Custom AS:Collection containers for app-specific listings.
        'apods:CreateCollection'
      ],
      optional: []
    },
    queueServiceUrl: process.env.QUEUE_SERVICE_URL || process.env.REDIS_URL
  }
};
