'use strict';

const { AppService } = require('@activitypods/app');

/**
 * Kind — application service.
 *
 * The AppService mixin from @activitypods/app handles:
 *  - exposing the app manifest at /.well-known/...
 *  - OIDC Dynamic Client Registration with the user's Pod Provider
 *  - the consent screen (read from `accessNeeds` below)
 *  - storage and refresh of Apps Access Grants
 *
 * What we declare here:
 *  1. The basic metadata users see on the consent screen.
 *  2. The data shapes we want to read/write in user Pods.
 *  3. The ActivityPub & WAC capabilities we need.
 *
 * TODO: the `kind:` ontology registration is not done here. It needs its own
 * service that mixins `@semapps/ontologies` OntologiesService. See follow-up.
 */
module.exports = {
  name: 'app',
  mixins: [AppService],

  settings: {
    // The base URL where this app server is reachable (used in the manifest).
    baseUrl: process.env.APP_BASE_URL,

    app: {
      name: 'Kind',
      description: 'A kind network — peer-reviewed, federated, post-growth',
      thumbnail: `${process.env.APP_BASE_URL || ''}/logo192.png`,
      frontUrl: process.env.APP_FRONT_URL
    },

    oidc: {
      clientUri: process.env.APP_FRONT_URL,
      redirectUris: `${process.env.APP_FRONT_URL}/auth-callback`,
      postLogoutRedirectUris: `${process.env.APP_FRONT_URL}/login?logout=true`,
      tosUri: `${process.env.APP_FRONT_URL}/terms`
    },

    // Apps Access Grants — what we ask the user to authorise.
    // Required: hard prerequisites for the app to work at all.
    // Optional: features the user can grant later (none in v0).
    accessNeeds: {
      required: [
        // Letters live in the user's Pod. We need both R and W.
        {
          shapeTreeUri: `${process.env.APP_BASE_URL}/shapetrees/Letter`,
          accessMode: ['acl:Read', 'acl:Write']
        },
        // Sources are first-class linked entities, also stored Pod-side.
        {
          shapeTreeUri: `${process.env.APP_BASE_URL}/shapetrees/Source`,
          accessMode: ['acl:Read', 'acl:Write']
        },
        // Circles are interest groups — see KindCirclesService.
        {
          shapeTreeUri: `${process.env.APP_BASE_URL}/shapetrees/Circle`,
          accessMode: ['acl:Read', 'acl:Write']
        },
        // ActivityPub plumbing — without these we can't federate.
        'apods:ReadInbox',
        'apods:ReadOutbox',
        'apods:PostOutbox',
        // WAC groups — needed by KindCirclesService to scope visibility.
        'apods:CreateAclGroup'
      ]
    },

    // Where the BullMQ job queue lives. Used by @activitypods/app internals
    // for remote ActivityPub delivery.
    queueServiceUrl: process.env.REDIS_URL
  }
};
