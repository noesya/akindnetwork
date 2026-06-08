'use strict';

const crypto = require('crypto');

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

  dependencies: ['api', 'ldp.resource', 'app-registrations'],

  async started() {
    // Expose our actions on the HTTP gateway. The catch-all LDP route is
    // installed by @semapps/ldp's api service and is registered LAST (because
    // CoreService's `optimizeRouteOrder` puts catchAll routes at the end), so
    // our specific aliases here take precedence over /:slug.*
    await this.broker.call('api.addRoute', {
      route: {
        path: '/kind',
        authentication: true,
        bodyParsers: { json: true },
        mappingPolicy: 'restrict',
        aliases: {
          'POST /peer-review/submit-draft': 'kind-peer-review.submitDraft'
          // 'POST /peer-review/approve'      → étape 3
          // 'POST /peer-review/reject'       → étape 3
        }
      }
    });
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

        const letter = await this._fetchLetter(ctx, letterUri);

        if (letter['kind:status'] !== 'draft') {
          throw new Error(`Letter ${letterUri} is not in draft state (got "${letter['kind:status']}")`);
        }

        const author = letter['as:attributedTo'] || letter.attributedTo;
        if (author && callerWebId !== author) {
          throw new Error('Only the author can submit a letter for review');
        }

        // Refuse a re-submit of the exact same text after a prior rejection.
        const hash = this._hashContent(letter);
        if (letter['kind:rejectedContentHash'] === hash) {
          throw new Error(
            'Resubmission blocked: the letter has not been modified since it was rejected'
          );
        }

        // Pool = everyone who's registered the app, minus the author.
        const pool = await this._getReviewerPool(ctx, callerWebId);
        if (pool.length < this.settings.reviewerCount) {
          throw new Error(
            `Not enough reviewers available (${pool.length}/${this.settings.reviewerCount}). ` +
              `Need at least ${this.settings.reviewerCount} other registered users.`
          );
        }
        const reviewers = this._sample(pool, this.settings.reviewerCount);

        await this._patchLetter(ctx, letterUri, {
          'kind:status': 'pending-review',
          'kind:assignedReviewers': reviewers,
          // Wipe any leftover vote tallies from a prior cycle.
          'kind:approvedBy': [],
          'kind:rejectedBy': []
        });

        ctx.emit('kind.letter.submitted', { letterUri, authorWebId: callerWebId, reviewers });

        return { reviewers };
      }
    }
  },

  methods: {
    async _fetchLetter(ctx, letterUri) {
      return ctx.call('ldp.resource.get', {
        resourceUri: letterUri,
        accept: 'application/ld+json'
      });
    },

    async _patchLetter(ctx, letterUri, patch) {
      return ctx.call('ldp.resource.patch', {
        resource: { id: letterUri, ...patch },
        contentType: 'application/ld+json'
      });
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
