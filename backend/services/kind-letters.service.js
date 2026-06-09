'use strict';

const { MoleculerClientError } = require('moleculer').Errors;

/**
 * KindLettersService — backend-side index of every letter the network knows
 * about. The frontend's read flow is fed from here rather than from each
 * user's pod directly, which is the cheapest way to give a reviewer in pod A
 * visibility into a letter living in pod B.
 *
 * Why an index :
 *   - SemApps' `useGetList('Letter')` only sees the Letters in the caller's
 *     own pod. With no shared substrate, a reviewer can't discover a letter
 *     they've been assigned to.
 *   - There's no inbox-based notification in Kind (per product decision —
 *     reviewable letters appear inline in the reading flow, not in a
 *     dedicated queue).
 *   - So we centralise just enough: the backend already orchestrates the
 *     peer-review lifecycle (submit/approve/reject), and emits events at
 *     every transition. This service hooks those events to maintain a
 *     {uri → metadata + body} map, and exposes three HTTP routes the
 *     frontend reads.
 *
 * The letter BODIES live in the index too (fetched server-side through the
 * author's AccessGrant). So the frontend doesn't need cross-pod read access
 * — it talks to a single trusted endpoint that already has the rights.
 * Drafts are NOT indexed (only the author should see those, and they read
 * their own pod directly via the dataProvider).
 *
 * The index is in-memory for v1. Restarts lose state; we rebuild on the
 * next round of letter activity. Persistence (Fuseki) is a later concern.
 */
module.exports = {
  name: 'kind-letters',

  dependencies: ['api'],

  async started() {
    await this.broker.call(
      'api.addRoute',
      {
        route: {
          path: '/letters',
          authentication: true,
          bodyParsers: { json: true },
          mappingPolicy: 'restrict',
          // Order matters here — moleculer-web tries aliases in declaration
          // order, and `/:id` would otherwise swallow `/feed`. The two-segment
          // alias (`/:id/children`) comes before the single-segment one for
          // the same reason.
          aliases: {
            'GET /feed': 'kind-letters.feed',
            'POST /_rehydrate': 'kind-letters.rehydrate',
            'GET /by-author/:username': 'kind-letters.byAuthor',
            'GET /:id/children': 'kind-letters.children',
            'GET /:id': 'kind-letters.byId'
          }
        },
        // Same trick as kind-peer-review — beat @semapps/ldp's catch-all
        // route which would otherwise swallow /letters/...
        toBottom: false
      }
    );
    this.logger.info('kind-letters HTTP routes registered at /letters/*');

    // The index is in-memory, so a backend restart loses every letter that
    // was indexed during the previous run. Trigger a rehydrate on boot to
    // re-discover all letters from every known user's pod via the SAI
    // grants chain. We fire-and-forget (no `await`) so a slow scan doesn't
    // block service startup; the index simply fills up progressively.
    this.broker
      .waitForServices(['app-registrations', 'pod-resources'])
      .then(() => this.broker.call('kind-letters.rehydrate'))
      .catch((e) => this.logger.warn(`auto-rehydrate skipped: ${e?.message || e}`));
  },

  created() {
    /** Map<letterUri, LetterEntry>. See _upsertFromLetter for shape. */
    this._index = new Map();
  },

  actions: {
    /**
     * Feed visible to the current viewer:
     *   - every published letter the topological filter keeps (no parent
     *     OR at least one published reply), plus
     *   - pending-review letters where the viewer is an assigned reviewer
     *     who hasn't voted yet.
     *
     * Sorted publishedAt desc so the most recent thread is on top.
     */
    feed: {
      async handler(ctx) {
        const me = ctx.meta.webId || 'anon';
        const all = Array.from(this._index.values());

        const visibleToMe = (e) => {
          if (e.status === 'published') return true;
          if (e.status !== 'pending-review') return false;
          if (me === 'anon') return false;
          const assigned = e.assignedReviewers || [];
          const approved = e.approvedBy || [];
          const rejected = (e.rejectedBy || []).map((r) => r.reviewer);
          return (
            assigned.includes(me) &&
            !approved.includes(me) &&
            !rejected.includes(me)
          );
        };

        // Topological filter applies only to published letters (a
        // pending-review entry visible to me as a reviewer should ALWAYS
        // show up even if it has no children yet).
        const childCount = new Map();
        for (const e of all) {
          if (e.parentUri && e.status === 'published') {
            childCount.set(e.parentUri, (childCount.get(e.parentUri) ?? 0) + 1);
          }
        }
        const visible = all.filter(visibleToMe).filter((e) => {
          if (e.status !== 'published') return true;
          if (!e.parentUri) return true;
          return (childCount.get(e.uri) ?? 0) > 0;
        });

        visible.sort((a, b) =>
          (b.publishedAt || '').localeCompare(a.publishedAt || '')
        );

        return { letters: visible, total: visible.length };
      }
    },

    /**
     * Children of a given parent URI. Published-only and sorted
     * chronologically — matches what the LetterView's "Réponses" section
     * displays inline.
     */
    /**
     * Published children of a parent letter, sorted chronologically.
     * Parent is identified by its UUID (last path segment of its full URI)
     * passed as a path param. The index already knows the parent's full
     * URI, so we just resolve and filter.
     */
    children: {
      params: { id: 'string' },
      async handler(ctx) {
        const { id } = ctx.params;
        const parent = Array.from(this._index.values()).find(
          (e) => e.uuid === id
        );
        if (!parent) {
          throw new MoleculerClientError(
            `No letter with id ${id}`,
            404,
            'NOT_FOUND'
          );
        }
        const list = Array.from(this._index.values())
          .filter(
            (e) => e.parentUri === parent.uri && e.status === 'published'
          )
          .sort((a, b) =>
            (a.publishedAt || '').localeCompare(b.publishedAt || '')
          );
        return { letters: list, total: list.length };
      }
    },

    /**
     * Every published letter by a given author. "Username" is the last
     * path segment of the author's WebID (e.g. "arnaudlevy" for the WebID
     * https://armoise.co/arnaudlevy). Unlike `feed`, the topological
     * filter is NOT applied — on an author page we want their full
     * publication history, including reply-leaves.
     */
    byAuthor: {
      params: { username: 'string' },
      async handler(ctx) {
        const { username } = ctx.params;
        const list = Array.from(this._index.values())
          .filter(
            (e) =>
              e.status === 'published' &&
              (e.authorWebId.split('/').filter(Boolean).pop() || '') === username
          )
          .sort((a, b) =>
            (b.publishedAt || '').localeCompare(a.publishedAt || '')
          );
        return { letters: list, total: list.length };
      }
    },

    /**
     * Single letter by UUID — the cross-pod replacement for the
     * frontend's `fromSlug(uuid, user.storage)` heuristic, which only
     * worked within the caller's own pod.
     */
    byId: {
      params: { id: 'string' },
      async handler(ctx) {
        const { id } = ctx.params;
        const found = Array.from(this._index.values()).find(
          (e) => e.uuid === id
        );
        if (!found) {
          throw new MoleculerClientError(
            `No letter with id ${id}`,
            404,
            'NOT_FOUND'
          );
        }
        return found;
      }
    },

    /**
     * Rebuild the index from scratch by scanning every registered user's
     * Letters container. Necessary after a backend restart because the
     * in-memory index doesn't persist. Triggered automatically on boot
     * and also exposed at `POST /letters/_rehydrate` for manual recovery.
     *
     * For each user we walk the SAI chain:
     *   AppRegistration → AccessGrants → DataGrants
     * filter the DataGrants whose `interop:registeredShapeTree` is our
     * as:Note shape, then GET each `interop:hasDataRegistration` URI as
     * a container and index every letter it `ldp:contains`.
     */
    rehydrate: {
      visibility: 'public',
      async handler(ctx) {
        const pods = (await ctx.call('app-registrations.getRegisteredPods')) || [];
        this.logger.info(`kind-letters.rehydrate: scanning ${pods.length} pods`);
        let indexed = 0;
        const NOTE_SHAPE = 'https://shapes.activitypods.org/shapetrees/as/Note';

        for (const webId of pods) {
          try {
            const appReg = await ctx.call('app-registrations.getForActor', {
              actorUri: webId
            });
            const accessGrants = this._asArray(appReg?.['interop:hasAccessGrant']);
            for (const agUri of accessGrants) {
              const ag = await ctx
                .call('access-grants.get', {
                  resourceUri: agUri,
                  webId: 'system'
                })
                .catch(() => null);
              if (!ag) continue;
              const dataGrants = this._asArray(ag['interop:hasDataGrant']);
              for (const dgUri of dataGrants) {
                const dg = await ctx
                  .call('data-grants.get', {
                    resourceUri: dgUri,
                    webId: 'system'
                  })
                  .catch(() => null);
                if (!dg) continue;
                if (dg['interop:registeredShapeTree'] !== NOTE_SHAPE) continue;
                const containerUri = dg['interop:hasDataRegistration'];
                if (!containerUri) continue;
                const containerRes = await ctx
                  .call('pod-resources.get', {
                    resourceUri: containerUri,
                    actorUri: webId
                  })
                  .catch(() => null);
                if (!containerRes?.ok || !containerRes.body) continue;
                const letters = this._asArray(containerRes.body['ldp:contains']);
                for (const lEntry of letters) {
                  const letterUri =
                    typeof lEntry === 'string'
                      ? lEntry
                      : lEntry?.id || lEntry?.['@id'];
                  if (!letterUri) continue;
                  await this._refreshEntry(ctx, letterUri, webId);
                  indexed++;
                }
              }
            }
          } catch (e) {
            this.logger.warn(
              `kind-letters.rehydrate: pod ${webId} failed — ${e?.message || e}`
            );
          }
        }
        this.logger.info(
          `kind-letters.rehydrate: done, indexed ${indexed} resource(s), ${this._index.size} live entries`
        );
        return { scanned: pods.length, indexed, liveEntries: this._index.size };
      }
    }
  },

  events: {
    // Every transition the peer-review service emits triggers a re-read of
    // the letter and a refresh of our index entry. We choose to re-read
    // rather than apply a delta because the author's pod is the source of
    // truth — if the patch failed partway, our index would diverge.
    async 'kind.letter.submitted'(ctx) {
      const { letterUri, authorWebId } = ctx.params;
      this.logger.info(`kind-letters: event submitted → refresh ${letterUri}`);
      await this._refreshEntry(ctx, letterUri, authorWebId);
    },
    async 'kind.letter.approved'(ctx) {
      const { letterUri, authorWebId } = ctx.params;
      this.logger.info(`kind-letters: event approved → refresh ${letterUri}`);
      await this._refreshEntry(ctx, letterUri, authorWebId);
    },
    async 'kind.letter.rejected'(ctx) {
      const { letterUri, authorWebId } = ctx.params;
      this.logger.info(`kind-letters: event rejected → refresh ${letterUri}`);
      await this._refreshEntry(ctx, letterUri, authorWebId);
    }
  },

  methods: {
    async _refreshEntry(ctx, letterUri, authorWebId) {
      try {
        const { ok, status, body } = await ctx.call('pod-resources.get', {
          resourceUri: letterUri,
          actorUri: authorWebId
        });
        if (!ok || !body) {
          this.logger.warn(
            `kind-letters: could not fetch ${letterUri} to refresh index (status=${status})`
          );
          return;
        }
        // Drafts are excluded from the index — only the author needs them,
        // and the author reads their own pod directly.
        if (body['kind:status'] === 'draft' || !body['kind:status']) {
          this._index.delete(letterUri);
          return;
        }
        this._upsertFromLetter(body, authorWebId);
        this.logger.info(
          `kind-letters: indexed ${letterUri} (status=${body['kind:status']})`
        );
      } catch (e) {
        this.logger.warn(
          `kind-letters: refresh failed for ${letterUri}: ${e?.message || e}`
        );
      }
    },

    /** Normalise a raw JSON-LD letter into the index entry shape. */
    _upsertFromLetter(letter, authorWebId) {
      const uri = letter.id || letter['@id'];
      if (!uri) return;
      // The "uuid" here is just the last path segment of the URI. SemApps
      // pods assign UUIDv4 to each LDP resource, so collisions across pods
      // are vanishingly unlikely — we treat the segment as a globally
      // unique short identifier and use it as the URL token.
      const uuid = uri.split('/').filter(Boolean).pop() || uri;
      this._index.set(uri, {
        uri,
        uuid,
        authorWebId,
        parentUri: letter.inReplyTo || letter['as:inReplyTo'] || null,
        status: letter['kind:status'] || 'draft',
        publishedAt:
          letter['as:published'] ||
          letter['dc:modified'] ||
          letter['dc:created'] ||
          null,
        title: letter.name || letter['as:name'] || '',
        content: letter.content || letter['as:content'] || '',
        language: letter['kind:language'] || 'fr',
        sources: this._asArray(letter['kind:sources']),
        approvedBy: this._asArray(letter['kind:approvedBy']),
        rejectedBy: this._asArray(letter['kind:rejectedBy']),
        assignedReviewers: this._asArray(letter['kind:assignedReviewers'])
      });
    },

    _asArray(v) {
      if (v == null) return [];
      return Array.isArray(v) ? v : [v];
    }
  }
};
