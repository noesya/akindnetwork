'use strict';

const crypto = require('crypto');
const { MoleculerClientError } = require('moleculer').Errors;

/**
 * KindPeerReviewService — gates the publication of a letter behind peer approval.
 *
 * Lifecycle:
 *
 *   draft  --submitDraft-->  pending-review  --approve x 2-->  published
 *                                  |
 *                                  +--reject x 2-->  rejected (back to author)
 *
 * Lazy assignment model:
 *  - There is NO pre-assignment of reviewers at submit time. submitDraft just
 *    flips status to "pending-review" and zeroes the vote tallies; the pool
 *    is implicitly "everyone except the author".
 *  - Reviewers self-select by reading their /read feed. The kind-letters
 *    index surfaces pending letters at the top of the feed for every viewer
 *    who isn't the author and hasn't already voted. First two approves
 *    publish, first two rejects send the letter back to draft.
 *  - Rationale: pre-assigning N reviewers at submit was fragile — if any of
 *    the chosen Ns went inactive, the letter stalled forever. Lazy
 *    assignment auto-reallocates as readers come online, with zero
 *    bookkeeping.
 *  - Legacy `kind:assignedReviewers` on already-pending letters is ignored
 *    by the runtime (the feed filter doesn't read it; the vote action
 *    doesn't check it). New submissions never write it.
 *
 * Rules:
 *  - Threshold is 2 approvals OR 2 rejections, first to reach it wins
 *    (KIND_REVIEW_THRESHOLD, default 2).
 *  - submitDraft counts against the 17/day quota; approving/rejecting are free.
 */
module.exports = {
  name: 'kind-peer-review',

  settings: {
    threshold: parseInt(process.env.KIND_REVIEW_THRESHOLD || '2', 10)
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
     * Move a letter from draft to pending-review. The pool of reviewers is
     * implicit — everyone except the author — so this action does NOT
     * pre-pick anyone; the kind-letters feed surfaces the letter to every
     * eligible viewer until two approves or two rejects close it.
     *
     * Throws if:
     *  - Caller isn't authenticated
     *  - Letter is not in draft state
     *  - Content hashes to a previous rejection (forces a real edit before resubmit)
     *
     * Returns { status: 'pending-review' }. Earlier versions returned the
     * picked reviewers; the frontend no longer needs that since assignment
     * is lazy.
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

        // Flip the status. No pre-assignment — readers self-select via the
        // feed. We wipe `assignedReviewers` for legacy resubmits and zero
        // any leftover vote tallies from a prior cycle.
        await this._patchLetter(
          ctx,
          letterUri,
          letter,
          {
            'kind:status': 'pending-review',
            'kind:assignedReviewers': [],
            'kind:approvedBy': [],
            'kind:rejectedBy': []
          },
          callerWebId
        );

        ctx.emit('kind.letter.submitted', { letterUri, authorWebId: callerWebId });

        return { status: 'pending-review' };
      }
    },

    /**
     * A reviewer votes "approve" on a letter awaiting review.
     *
     * Rules:
     *   - Caller must NOT be the author (no self-review)
     *   - Caller must not have already voted (approve OR reject)
     *   - After tallying, if approves ≥ threshold → status flips to "published"
     *
     * With lazy assignment, "is this reviewer allowed?" reduces to "are
     * they not the author and haven't voted yet?" — no pool membership
     * check anymore.
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

      // No self-review: an author cannot vote on their own letter. This is
      // the only structural restriction now — everyone else in the network
      // is implicitly eligible (assignment is lazy via the feed).
      if (reviewerWebId === authorWebId) {
        throw new MoleculerClientError(
          'You cannot review your own letter',
          403,
          'SELF_REVIEW'
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

    _hashContent(letter) {
      const payload = JSON.stringify({
        name: letter['as:name'] || letter.name,
        content: letter['as:content'] || letter.content
      });
      return crypto.createHash('sha256').update(payload).digest('hex');
    }
  }
};
