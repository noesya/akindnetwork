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
          // The `:id` parameter is constrained to UUIDv4 shape
          // (8-4-4-4-12 hex with dashes = 36 chars). Without that
          // constraint, `GET /letters/feed` matches `/:id` with
          // id="feed" because @semapps/core overrides moleculer-web's
          // route optimiser with a single-arg comparator that doesn't
          // preserve declaration order between aliases. Anchoring `:id`
          // to a UUID pattern makes the matcher reject `feed`,
          // `by-author/...`, etc. — they fall through to their literal
          // aliases above.
          aliases: {
            'GET /feed': 'kind-letters.feed',
            'POST /_rehydrate': 'kind-letters.rehydrate',
            'GET /by-author/:username': 'kind-letters.byAuthor',
            'GET /:id([a-fA-F0-9-]{36})/children': 'kind-letters.children',
            'GET /:id([a-fA-F0-9-]{36})': 'kind-letters.byId'
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
    // re-discover all letters from every known user's pod via the
    // cached DataGrants. Fire-and-forget so a slow scan doesn't block
    // service startup; the index fills up progressively.
    //
    // We MUST wait for `app` too, not just `data-grants` + `pod-resources`.
    // `pod-resources.get` internally calls `app.get` to resolve the app
    // actor for the outbound HTTP request — and AppService finishes
    // registering ~2s AFTER its own dependencies are ready. Without this
    // guard the first boot scan fires its fetches into the gap and every
    // one fails with "Service 'app.get' is not found", leaving the index
    // empty until a peer-review event re-triggers a refresh later on.
    this.broker
      .waitForServices(['app', 'data-grants', 'pod-resources'])
      .then(() => this.broker.call('kind-letters.rehydrate'))
      .catch((e) => this.logger.warn(`auto-rehydrate skipped: ${e?.message || e}`));
  },

  created() {
    /** Map<letterUri, LetterEntry>. See _upsertFromLetter for shape. */
    this._index = new Map();
  },

  actions: {
    /**
     * Feed visible to the current viewer.
     *
     * Composition:
     *   - every PENDING-REVIEW letter the viewer can vote on:
     *       not the author, hasn't already voted (approve OR reject).
     *     There is no pre-assignment — anyone in the network is implicitly
     *     eligible. This is how peer review actually finds reviewers:
     *     people who open /read get pending letters surfaced in their flow.
     *   - every PUBLISHED letter the topological filter keeps (no parent
     *     OR at least one published reply).
     *
     * Ordering: pending letters at the TOP (most recent first), then
     * published letters (most recent first). Putting pending up top is
     * deliberate — it creates collective pressure to drain the review
     * backlog rather than letting letters languish.
     *
     * Anonymous viewers only see published letters (no review action
     * possible without a WebID).
     */
    feed: {
      async handler(ctx) {
        const me = ctx.meta.webId || 'anon';
        const all = Array.from(this._index.values());

        const visibleToMe = (e) => {
          if (e.status === 'published') return true;
          if (e.status !== 'pending-review') return false;
          if (me === 'anon') return false;
          if (e.authorWebId === me) return false; // no self-review
          const approved = e.approvedBy || [];
          const rejected = (e.rejectedBy || []).map((r) =>
            typeof r === 'string' ? r : r?.reviewer
          );
          return !approved.includes(me) && !rejected.includes(me);
        };

        // Topological filter applies only to published letters (a
        // pending-review entry should ALWAYS show up to its eligible
        // reviewers, even if it has no children yet).
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

        // Sort: pending first (status priority), then publishedAt desc
        // within each group. localeCompare flipped because we want newest
        // on top.
        const statusRank = (s) => (s === 'pending-review' ? 0 : 1);
        visible.sort((a, b) => {
          const rankDiff = statusRank(a.status) - statusRank(b.status);
          if (rankDiff !== 0) return rankDiff;
          return (b.publishedAt || '').localeCompare(a.publishedAt || '');
        });

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
     * Rebuild the index from scratch by scanning every cached DataGrant.
     * Necessary after a backend restart because the in-memory index
     * doesn't persist. Triggered automatically on boot and also exposed at
     * `POST /letters/_rehydrate` for manual recovery.
     *
     * Strategy: `data-grants.list` returns every DataGrant our app has
     * been issued by any user. Each DataGrant points at a container in
     * the user's pod that holds resources of a given shape tree. Filter
     * to as:Note grants, GET each container via the dataOwner's pod, and
     * index every letter `ldp:contains` returns.
     *
     * Verbose logging at each step so a failed scan is easy to diagnose
     * from `docker compose logs`.
     */
    rehydrate: {
      visibility: 'public',
      async handler(ctx) {
        this.logger.info('kind-letters.rehydrate: starting');
        const NOTE_SHAPE = 'https://shapes.activitypods.org/shapetrees/as/Note';

        let dgContainer;
        try {
          dgContainer = await ctx.call('data-grants.list', { webId: 'system' });
        } catch (e) {
          this.logger.warn(
            `kind-letters.rehydrate: data-grants.list failed — ${e?.message || e}`
          );
          return { error: 'list-failed', message: String(e?.message || e) };
        }

        const dataGrants = this._asArray(dgContainer?.['ldp:contains']);
        this.logger.info(
          `kind-letters.rehydrate: ${dataGrants.length} data grants in cache`
        );

        let scanned = 0;
        let indexed = 0;

        for (const dg of dataGrants) {
          scanned++;
          const dgId = dg?.id || dg?.['@id'] || '(no id)';
          const shape = dg?.['interop:registeredShapeTree'];

          if (shape !== NOTE_SHAPE) {
            this.logger.info(
              `kind-letters.rehydrate: skip DG ${dgId} — shape=${shape}`
            );
            continue;
          }

          // The DataGrant's `dataOwner` is the user whose pod we read; the
          // `hasDataRegistration` is the container URI inside that pod.
          // `dataOwner` may be a string or {@id: '...'} depending on
          // serialisation.
          const ownerRaw = dg['interop:dataOwner'];
          const owner =
            typeof ownerRaw === 'string' ? ownerRaw : ownerRaw?.['@id'] || ownerRaw?.id;
          const containerRaw = dg['interop:hasDataRegistration'];
          const containerUri =
            typeof containerRaw === 'string'
              ? containerRaw
              : containerRaw?.['@id'] || containerRaw?.id;

          if (!owner || !containerUri) {
            this.logger.warn(
              `kind-letters.rehydrate: DG ${dgId} missing owner or container ` +
                `(owner=${owner}, container=${containerUri})`
            );
            continue;
          }

          this.logger.info(
            `kind-letters.rehydrate: reading ${containerUri} as ${owner}`
          );

          let containerRes;
          try {
            containerRes = await ctx.call('pod-resources.get', {
              resourceUri: containerUri,
              actorUri: owner
            });
          } catch (e) {
            this.logger.warn(
              `kind-letters.rehydrate: container fetch threw — ${e?.message || e}`
            );
            continue;
          }
          if (!containerRes?.ok) {
            this.logger.warn(
              `kind-letters.rehydrate: container ${containerUri} returned status=${containerRes?.status}`
            );
            continue;
          }

          const items = this._asArray(containerRes.body?.['ldp:contains']);
          this.logger.info(
            `kind-letters.rehydrate: container has ${items.length} item(s)`
          );

          for (const item of items) {
            const letterUri =
              typeof item === 'string' ? item : item?.id || item?.['@id'];
            if (!letterUri) continue;
            await this._refreshEntry(ctx, letterUri, owner);
            indexed++;
          }
        }

        this.logger.info(
          `kind-letters.rehydrate: done — scanned ${scanned} DG, indexed ${indexed} item(s), ${this._index.size} live entries`
        );
        return {
          scanned,
          indexed,
          liveEntries: this._index.size
        };
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
