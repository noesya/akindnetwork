'use strict';

const Redis = require('ioredis');

/**
 * RateLimit middleware — enforces the famous "17 actions per day".
 *
 * Locked decision 2026-06-06 (see memory/project_kind_17_actions.md):
 *  - Only `kind-peer-review.submitDraft` counts. Writing a new letter and
 *    responding to one are the same primitive (a kind:Letter with or without
 *    kind:respondsTo), so the cap applies uniformly.
 *  - Approving, rejecting, saving a draft, reading anything = 0 actions.
 *
 * Storage: Redis. Key = `kind:rate:<webId>:<YYYY-MM-DD>` with a 25h TTL so the
 * counter rolls over with a small safety margin. Atomic INCR ensures correctness
 * under concurrent submissions.
 */

const TRACKED_ACTIONS = new Set(['kind-peer-review.submitDraft']);

let redis = null;
function getRedis() {
  if (redis) return redis;
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    keyPrefix: 'kind:rate:'
  });
  return redis;
}

module.exports = {
  name: 'KindRateLimit',

  localAction(next, action) {
    if (!TRACKED_ACTIONS.has(action.name)) return next;

    const limit = parseInt(process.env.KIND_DAILY_ACTION_LIMIT || '17', 10);

    return async function (ctx) {
      const webId = ctx.meta && ctx.meta.webId;
      if (!webId) {
        // No webId means an internal call (e.g. a bot publishing on behalf of
        // a user it already authorised). Skip the counter — internal flows are
        // expected to enforce their own discipline.
        return next(ctx);
      }

      const day = new Date().toISOString().slice(0, 10);
      const key = `${webId}:${day}`;
      const client = getRedis();

      const used = await client.incr(key);
      if (used === 1) await client.expire(key, 25 * 3600);

      if (used > limit) {
        // Decrement back so concurrent calls don't accumulate spurious counts.
        await client.decr(key);
        const err = new Error(
          `Daily limit of ${limit} letters reached. See you tomorrow.`
        );
        err.code = 429;
        err.type = 'KIND_DAILY_LIMIT_REACHED';
        err.data = { limit, used: limit, resetsAt: this._endOfDay() };
        throw err;
      }

      return next(ctx);
    };
  },

  _endOfDay() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.toISOString();
  }
};
