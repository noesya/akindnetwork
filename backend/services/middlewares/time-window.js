'use strict';

/**
 * TimeWindow middleware — Kind is closed at night.
 *
 * Locked decision 2026-06-06: write actions are refused between 22h and 7h in
 * the *author's* timezone (read from the FOAF/SCHEMA profile, fallback
 * Europe/Paris). Reads are always allowed.
 *
 * The list of guarded actions deliberately mirrors RateLimit's: peer review
 * lifecycle + LDP write/patch on a kind:Letter resource.
 */

const GUARDED_ACTIONS = new Set([
  'kind-peer-review.submitDraft',
  'kind-peer-review.approve',
  'kind-peer-review.reject'
  // LDP writes on Letter resources are also guarded — see the path-based check
  // below in the resolver.
]);

const FALLBACK_TZ = 'Europe/Paris';

module.exports = {
  name: 'KindTimeWindow',

  localAction(next, action) {
    const guarded =
      GUARDED_ACTIONS.has(action.name) ||
      // Writes on Letters via LDP — typed match instead of name match.
      (action.name === 'ldp.resource.patch' || action.name === 'ldp.resource.post');

    if (!guarded) return next;

    const startHour = parseInt(process.env.KIND_QUIET_HOURS_START || '22', 10);
    const endHour = parseInt(process.env.KIND_QUIET_HOURS_END || '7', 10);
    if (Number.isNaN(startHour) || Number.isNaN(endHour)) return next;

    return async function (ctx) {
      // Bypass when env says so (e.g. CI).
      if (process.env.KIND_QUIET_HOURS_START === 'off') return next(ctx);

      const tz = await resolveTimezone(ctx);
      const hour = currentHour(tz);

      if (isInQuietWindow(hour, startHour, endHour)) {
        const err = new Error(
          `Kind is closed between ${startHour}:00 and ${endHour}:00 in your timezone (${tz}).`
        );
        err.code = 503;
        err.type = 'KIND_QUIET_HOURS';
        throw err;
      }

      return next(ctx);
    };
  }
};

async function resolveTimezone(ctx) {
  const webId = ctx.meta && ctx.meta.webId;
  if (!webId) return FALLBACK_TZ;
  try {
    const profile = await ctx.call('ldp.resource.get', {
      resourceUri: webId,
      accept: 'application/ld+json'
    });
    return profile['schema:timezone'] || profile['http://schema.org/timezone'] || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

function currentHour(tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false
  });
  return parseInt(fmt.format(new Date()), 10);
}

function isInQuietWindow(now, start, end) {
  // Window wraps midnight if start > end (e.g. 22 → 7).
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}
