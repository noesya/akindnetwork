#!/usr/bin/env node
/**
 * Workaround for a race condition in @semapps/activitypub@1.1.2.
 *
 * `Service.appendActorData` is registered as a `ldp.resource.created` listener.
 * The event can fire BEFORE the resource is actually retrievable via SPARQL —
 * `this.actions.get(actorUri)` returns `false` and the subsequent
 * `getSlugFromUri(userData.id || userData['@id'])` throws
 *   TypeError: Cannot read properties of undefined (reading 'match')
 *
 * This crashes the AppService boot because `awaitCreateComplete` then times
 * out waiting for the actor's properties to materialise.
 *
 * Fix: wrap the initial `actions.get` in a small retry loop (5 × 500 ms) and
 * skip the function gracefully if the resource still isn't visible. Idempotent
 * — re-running the patch is a no-op once applied.
 *
 * Triggered as a postinstall step. Run manually:
 *   node patches/semapps-activitypub-actor.js
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(
  __dirname,
  '../node_modules/@semapps/activitypub/services/activitypub/subservices/actor.js'
);

if (!fs.existsSync(TARGET)) {
  console.warn(`[patch] target not found, skipping: ${TARGET}`);
  process.exit(0);
}

const SENTINEL = '/* KIND_PATCH:appendActorData-retry */';
let content = fs.readFileSync(TARGET, 'utf8');

if (content.includes(SENTINEL)) {
  console.log('[patch] already applied');
  process.exit(0);
}

const before =
  "const userData = await this.actions.get({ actorUri, webId: 'system' }, { parentCtx: ctx });";

const after = `${SENTINEL}
      let userData;
      for (let i = 0; i < 5; i += 1) {
        userData = await this.actions.get({ actorUri, webId: 'system' }, { parentCtx: ctx, meta: { $cache: false } });
        if (userData && (userData.id || userData['@id'])) break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (!userData || !(userData.id || userData['@id'])) {
        this.logger.warn(\`appendActorData: \${actorUri} not retrievable after 5 retries, skipping\`);
        return;
      }`;

if (!content.includes(before)) {
  console.error(`[patch] anchor string not found in ${TARGET} — package version probably bumped, review the patch`);
  process.exit(1);
}

content = content.replace(before, after);
fs.writeFileSync(TARGET, content);
console.log('[patch] @semapps/activitypub actor.js: added appendActorData retry guard');
