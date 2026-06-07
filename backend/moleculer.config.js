'use strict';

require('dotenv').config();

const rateLimit = require('./services/middlewares/rate-limit');
const timeWindow = require('./services/middlewares/time-window');

module.exports = {
  namespace: 'kind',
  nodeID: process.env.NODE_ID || `kind-app-${process.pid}`,

  logger: {
    type: 'Console',
    options: {
      level: process.env.LOG_LEVEL || 'info'
    }
  },

  transporter: process.env.REDIS_URL
    ? { type: 'Redis', options: { url: process.env.REDIS_URL } }
    : null,

  // Cache & metrics: kept simple for dev. Re-enable Prometheus when going to prod.
  cacher: 'Memory',

  // Custom Kind middlewares — registered globally so they wrap every action.
  // Each middleware is responsible for short-circuiting only the actions it cares
  // about (cf. their internal action-name filters).
  middlewares: [rateLimit, timeWindow],

  // Misc
  requestTimeout: 30 * 1000,
  retryPolicy: { enabled: false },
  maxCallLevel: 100,
  heartbeatInterval: 5,
  heartbeatTimeout: 15,

  hotReload: process.env.NODE_ENV !== 'production'
};
