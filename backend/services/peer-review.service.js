'use strict';

const crypto = require('crypto');
const { MoleculerError, MoleculerClientError } = require('moleculer').Errors;

/**
 * KindPeerReviewService — gates the publication of a letter behind peer approval.
 *
 * Lifecycle:
 *
 *   draft  --submitDraft-->  pending-review  --approve x 2-->  published
 *                                  |
 *                                  +--reject x 2-->  rejected (back to author)
 *
 * Étape 2 scope (this commit):
 *  - submitDraft picks 3 random reviewers from the pool of all WebIDs that
 *    have registered the app, excluding the author. The chosen WebIDs are
 *    written onto the Letter as `kind:assignedReviewers`, and the Letter's
 *    `kind:status` flips to "pending-review".
 *  - The pool comes straight from `app-registrations.getRegisteredPods` —
 *    no extra registry to maintain.
 *  - We DO NOT yet manage WebACL on the author's Pod (the backend doesn't
 *    have Control rights on remote resources). For now, assigned reviewers
 *    can see the Letter because their frontend will fetch it via the user's
 *    /proxy + Bearer token; the read flow's filter is what hides it from
 *    everyone else.
 *
 * Étape 3 (next commit):
 *  - approve / reject actions
 *  - aggregation: 2 approvals → published, 2 rejections → rejected
 *  - rejection stores a content hash so a verbatim re-submit is refused
 *
 * Rules:
 *  - Threshold is fixed at 2 approvals (KIND_REVIEW_THRESHOLD).
 *  - submitDraft counts against the 17/day quota; approving/rejecting are free.
 */
module.exports = {
  name: 'kind-peer-review',

  settings: {
    threshold: parseInt(process.env.KIND_REVIEW_THRESHOLD || '2', 10),
    reviewerCount: parseInt(process.env.KIND_REVIEWER_COUNT || '3', 10)
  },

  // We only hard-depend on `api` so that addRoute exists. The pod-resources
  // and app-registrations services are used inside handlers — if they're
  // slow to come up, requests will retry rather than the whole service
  // refusing to start.
  dependencies: ['api'],

  async started() {
    // Expose our actions on the HTTP gateway.
    //
    // `toBottom: false` is critical: @semapps/ldp registers a catch-all route
    // at `/:slugParts*` which would happily swallow `/kind/peer-review/...`
    // first. CoreService overrides `optimizeRouteOrder` to push catchAll
    // routes to the end, but its single-arg `.sort(a => ...)` doesn't always
    // produce a stable reorder across V8 versions. Inserting our route at
    // the top of the list sidesteps the ordering question entirely.
    await this.broker.call(
      'api.addRoute',
      {
        route: {
          path: '/peer-review',
          authentication: true,
          bodyParsers: { json: true },
          mappingPolicy: 'restrict',
          aliases: {
            'POST /submit-draft': 'kind-peer-review.submitDraft',
            'POST /approve': 'kind-peer-review.approve',
            'POST /reject': 'kind-peer-review.reject'
          }
        },
        toBottom: false
      }
    );

    this.logger.info('kind-peer-review HTTP route registered at /peer-review/*');
  },

  actions: {
    /**
     * Move a letter from draft to pending-review, assigning N random reviewers
     * from the pool of registered users (excluding the author).
     *
     * Throws if:
     *  - Letter is not in draft state
     *  - Caller is not the author
     *  - Content hashes to a previous rejection (forces a real edit)
     *  - Pool has fewer than N candidates
     *
     * Returns { reviewers: [webId, ...] } so the frontend can display who's
     * been asked to review.
     */
    submitDraft: {
      params: { letterUri: 'string' },
      async handler(ctx) {
        const { letterUri } = ctx.params;
        const callerWebId = ctx.meta.webId;
        this.logger.info(
          `submitDraft called: letterUri=${letterUri} caller=${callerWebId}`
        );
        if (!callerWebId || callerWebId === 'anon') {
          throw new MoleculerClientError('Authentication required', 401, 'UNAUTHORIZED');
        }

        // The caller is also the pod owner — we read/write their letter
        // using their AccessGrant via the FetchPodOrProxy mixin. WAC on the
        // remote pod ensures we can only touch resources the user owns.
        const letter = await this._fetchLetter(ctx, letterUri, callerWebId);
        this.logger.info(
          `Letter fetched: status=${letter?.['kind:status']} hasContent=${Boolean(letter?.content)}`
        );

        if (letter['kind:status'] !== 'draft') {
          throw new MoleculerClientError(
            `Letter is not in draft state (current: ${letter['kind:status'] || 'unknown'})`,
            409,
            'NOT_A_DRAFT'
          );
        }

        // Refuse a re-submit of the exact same text after a prior rejection.
        const hash = this._hashContent(letter);
        if (letter['kind:rejectedContentHash'] === hash) {
          throw new MoleculerClientError(
            'Resubmission blocked: the letter has not been modified since it was rejected. Edit the text and try again.',
            409,
            'UNCHANGED_AFTER_REJECTION'
          );
        }

        // Pool = everyone who's registered the app, minus the author.
        const pool = await this._getReviewerPool(ctx, callerWebId);
        if (pool.length < this.settings.reviewerCount) {
          // 503 Service Unavailable is the closest standard status for "the
          // app is up but can't accept this submission right now because the
          // network doesn't have enough peers yet". The message must include
          // the actual numbers so the user knows whether to retry later.
          throw new MoleculerError(
            `Not enough reviewers available (${pool.length}/${this.settings.reviewerCount}). ` +
              `The network needs ${this.settings.reviewerCount} other registered users before a letter ` +
              `can be submitted for review.`,
            503,
            'NOT_ENOUGH_REVIEWERS',
            { available: pool.length, required: this.settings.reviewerCount }
          );
        }
        const reviewers = this._sample(pool, this.settings.reviewerCount);

        await this._patchLetter(
          ctx,
          letterUri,
          letter,
          {
            'kind:status': 'pending-review',
            'kind:assignedReviewers': reviewers,
            // Wipe any leftover vote tallies from a prior cycle.
            'kind:approvedBy': [],
            'kind:rejectedBy': []
          },
          callerWebId
        );

        ctx.emit('kind.letter.submitted', { letterUri, authorWebId: callerWebId, reviewers });

        return { reviewers };
      }
    },

    /**
     * A reviewer votes "approve" on a letter awaiting review.
     *
     * Rules:
     *   - Caller must be in `kind:assignedReviewers`
     *   - Caller must not have already voted (approve OR reject)
     *   - After tallying, if approves ≥ threshold → status flips to "published"
     *
     * The caller is the REVIEWER; the resource being patched lives on the
     * AUTHOR'S Pod. We use pod-resources with `actorUri = authorWebId` so the
     * request is signed as the app acting on behalf of the author (via the
     * AccessGrant the author granted on SAI consent), which is what the
     * remote Pod's WAC will accept for a write on the author's resource.
     */
    approve: {
      params: { letterUri: 'string' },
      async handler(ctx) {
        return this._castVote(ctx, { decision: 'approve', comment: null });
      }
    },

    /**
     * A reviewer votes "reject" on a letter, with a mandatory short comment
     * the author will see. After tallying, if rejects ≥ threshold the letter
     * bounces back to "draft" — the author can edit and resubmit, but a
     * verbatim resubmission is refused via the stored content hash.
     */
    reject: {
      params: {
        letterUri: 'string',
        comment: { type: 'string', min: 1, max: 500 }
      },
      async handler(ctx) {
        return this._castVote(ctx, { decision: 'reject', comment: ctx.params.comment });
      }
    }
  },

  methods: {
    /**
     * Shared body of `approve` and `reject`. Both follow the exact same dance
     * (find author → fetch letter → check assignment → record vote → tally),
     * just with different mutation shapes.
     */
    async _castVote(ctx, { decision, comment }) {
      const { letterUri } = ctx.params;
      const reviewerWebId = ctx.meta.webId;
      this.logger.info(
        `${decision} called: letterUri=${letterUri} reviewer=${reviewerWebId}`
      );
      if (!reviewerWebId || reviewerWebId === 'anon') {
        throw new MoleculerClientError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const authorWebId = this._extractAuthorWebId(letterUri);
      if (!authorWebId) {
        throw new MoleculerClientError(
          `Cannot determine author from letter URI ${letterUri}`,
          400,
          'BAD_LETTER_URI'
        );
      }

      const letter = await this._fetchLetter(ctx, letterUri, authorWebId);

      if (letter['kind:status'] !== 'pending-review') {
        throw new MoleculerClientError(
          `Letter is not awaiting review (current status: ${letter['kind:status'] || 'unknown'})`,
          409,
          'NOT_IN_REVIEW'
        );
      }

      const assigned = this._asArray(letter['kind:assignedReviewers']);
      if (!assigned.includes(reviewerWebId)) {
        throw new MoleculerClientError(
          'You are not assigned as a reviewer for this letter',
          403,
          'NOT_ASSIGNED'
        );
      }

      // A reviewer gets exactly one ballot — checking both lists prevents
      // both "vote twice the same way" and "approve then change to reject".
      const approvedBy = this._asArray(letter['kind:approvedBy']);
      const rejectedBy = this._asArray(letter['kind:rejectedBy']);
      const alreadyVoted =
        approvedBy.includes(reviewerWebId) ||
        rejectedBy.some(r => (typeof r === 'string' ? r : r?.reviewer) === reviewerWebId);
      if (alreadyVoted) {
        throw new MoleculerClientError(
          'You have already voted on this letter',
          409,
          'ALREADY_VOTED'
        );
      }

      // Tally with the new vote applied.
      const nextApproved = decision === 'approve'
        ? [...approvedBy, reviewerWebId]
        : approvedBy;
      const nextRejected = decision === 'reject'
        ? [...rejectedBy, { reviewer: reviewerWebId, comment }]
        : rejectedBy;

      const patch = {
        'kind:approvedBy': nextApproved,
        'kind:rejectedBy': nextRejected
      };

      // Aggregation: threshold reached either way → final state.
      //   ≥ threshold approves : publish
      //   ≥ threshold rejects  : back to draft, store content hash to
      //                          prevent verbatim resubmit
      // Below threshold: letter stays in pending-review until the third vote.
      if (nextApproved.length >= this.settings.threshold) {
        patch['kind:status'] = 'published';
        patch['as:published'] = new Date().toISOString();
      } else if (nextRejected.length >= this.settings.threshold) {
        patch['kind:status'] = 'draft';
        patch['kind:rejectedContentHash'] = this._hashContent(letter);
        // Carry the rejection reasons forward as `kind:rejectionReasons` so
        // the editor can surface them; `kind:approvedBy` is wiped so the
        // next review cycle starts fresh.
        patch['kind:rejectionReasons'] = nextRejected;
        patch['kind:approvedBy'] = [];
        patch['kind:rejectedBy'] = [];
        patch['kind:assignedReviewers'] = [];
      }

      await this._patchLetter(ctx, letterUri, letter, patch, authorWebId);

      const finalStatus = patch['kind:status'] || 'pending-review';
      ctx.emit(`kind.letter.${decision}d`, {
        letterUri,
        authorWebId,
        reviewerWebId,
        finalStatus
      });

      return {
        status: finalStatus,
        approvedCount: nextApproved.length,
        rejectedCount: nextRejected.length,
        threshold: this.settings.threshold
      };
    },

    /**
     * Parse the author's WebID from a Letter URI. SemApps Pods host user
     * resources under `https://<host>/<username>/data/<uuid>`, so the WebID
     * is `https://<host>/<username>` (everything up to but not including
     * `/data/`). Returns null on a URI that doesn't match the pattern.
     */
    _extractAuthorWebId(letterUri) {
      const m = letterUri.match(/^(https?:\/\/[^/]+\/[^/]+)\/data\//);
      return m ? m[1] : null;
    },

    _asArray(v) {
      if (v == null) return [];
      return Array.isArray(v) ? v : [v];
    },

    /**
     * Read a Letter from the author's Pod via the SAI proxy + signature
     * dance. `actorUri` is the Pod owner (same as the caller for our flow).
     * pod-resources.get returns { ok, status, body } — body is the parsed
     * JSON-LD when ok=true.
     *
     * Wraps every failure mode (call throws, returns undefined, returns
     * !ok) in a Moleculer-friendly error with enough context that we can
     * tell apart "our backend bug", "remote pod returned X", and "service
     * missing".
     */
    async _fetchLetter(ctx, letterUri, actorUri) {
      let result;
      try {
        result = await ctx.call('pod-resources.get', { resourceUri: letterUri, actorUri });
      } catch (e) {
        this.logger.error(
          `pod-resources.get threw for ${letterUri} (actor=${actorUri}): ${e?.name}: ${e?.message}`,
          e
        );
        throw new Error(
          `pod-resources.get threw: ${e?.message || e}. Letter=${letterUri}, actor=${actorUri}`
        );
      }
      if (!result) {
        this.logger.error(
          `pod-resources.get returned ${result} for ${letterUri} (actor=${actorUri})`
        );
        throw new Error(
          `pod-resources.get returned no response for ${letterUri}`
        );
      }
      const { ok, status, statusText, body } = result;
      if (!ok) {
        this.logger.warn(
          `pod-resources.get not ok for ${letterUri}: status=${status} statusText=${statusText}`
        );
        throw new Error(
          `Pod returned HTTP ${status}${statusText ? ' ' + statusText : ''} when fetching ${letterUri}`
        );
      }
      return body;
    },

    /**
     * "Patch" by GET → merge → PUT. We use PUT (full replacement) rather
     * than pod-resources.patch because patch expects sparqljs RDF triple
     * structures, whereas our updates are plain key/value JSON-LD. The GET
     * we just did above is reused — caller passes it in as `current` to
     * avoid a redundant round-trip.
     */
    async _patchLetter(ctx, letterUri, current, patch, actorUri) {
      const merged = { ...current, ...patch, id: letterUri };
      let result;
      try {
        result = await ctx.call('pod-resources.put', { resource: merged, actorUri });
      } catch (e) {
        this.logger.error(
          `pod-resources.put threw for ${letterUri} (actor=${actorUri}): ${e?.name}: ${e?.message}`,
          e
        );
        throw new Error(`pod-resources.put threw: ${e?.message || e}`);
      }
      const { ok, status, statusText } = result || {};
      if (!ok) {
        this.logger.warn(
          `pod-resources.put not ok for ${letterUri}: status=${status} statusText=${statusText}`
        );
        throw new Error(
          `Pod returned HTTP ${status}${statusText ? ' ' + statusText : ''} when updating ${letterUri}`
        );
      }
      return merged;
    },

    /**
     * The reviewer pool is the set of WebIDs whose AppRegistration we hold
     * (i.e. anyone who's clicked through SAI consent for Kind), minus the
     * author themselves. Self-review is never allowed.
     *
     * Returned WebIDs are deduplicated and the order is whatever the LDP
     * container returns — `_sample` shuffles before picking.
     */
    async _getReviewerPool(ctx, exclude) {
      const all = (await ctx.call('app-registrations.getRegisteredPods')) || [];
      return [...new Set(all)].filter(webId => webId && webId !== exclude);
    },

    /** Fisher-Yates-ish sample of `n` distinct elements. */
    _sample(arr, n) {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    },

    _hashContent(letter) {
      const payload = JSON.stringify({
        name: letter['as:name'] || letter.name,
        content: letter['as:content'] || letter.content
      });
      return crypto.createHash('sha256').update(payload).digest('hex');
    }
  }
};
