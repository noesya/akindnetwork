'use strict';

require('dotenv').config();

const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');
const rateLimit = require('./services/middlewares/rate-limit');
const timeWindow = require('./services/middlewares/time-window');

// SemApps' action cacher — uses a dedicated Redis DB (or memory if unset) for
// inter-action result caching. The boilerplate strongly recommends putting it
// in front of the WebACL middleware, which itself relies on this cache to
// keep ACL checks cheap.
const cacherConfig = process.env.REDIS_CACHE_URL
  ? {
      type: 'Redis',
      options: {
        prefix: 'action',
        ttl: 2592000, // 30 days
        redis: process.env.REDIS_CACHE_URL
      }
    }
  : undefined;

module.exports = {
  namespace: 'kind',
  nodeID: process.env.NODE_ID || `kind-app-${process.pid}`,

  logger: {
    type: 'Console',
    options: {
      formatter: 'short',
      level: process.env.LOG_LEVEL || 'info'
    }
  },

  // Moleculer auto-detects the transporter from a URL string. Passing it as
  // `{ options: { url: ... } }` would NOT work because ioredis doesn't accept
  // a `url` key in its options object — it'd silently fall back to localhost.
  transporter: process.env.REDIS_URL || null,

  // Middleware order matters:
  //   1. CacherMiddleware — must come BEFORE WebAclMiddleware so ACL checks
  //      can leverage the cache (boilerplate convention).
  //   2. WebAclMiddleware — enforces Solid WebACL on every LDP action AND
  //      properly sequences ldp.resource.created events behind the SPARQL
  //      transaction commit. Without it, our `appendActorData` listener
  //      fires before the resource is queryable → race condition.
  //   3. Kind-specific middlewares — the 17/day + 22h-7h business rules.
  middlewares: [
    CacherMiddleware(cacherConfig),
    WebAclMiddleware({ baseUrl: process.env.APP_BASE_URL }),
    rateLimit,
    timeWindow
  ],

  // Misc
  requestTimeout: 30 * 1000,
  retryPolicy: { enabled: false },
  maxCallLevel: 100,
  heartbeatInterval: 5,
  heartbeatTimeout: 15,

  hotReload: process.env.NODE_ENV !== 'production'
};
