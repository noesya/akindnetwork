'use strict';

const crypto = require('crypto');

/**
 * KindPeerReviewService — gates the publication of a letter behind peer approval.
 *
 * Lifecycle (see docs/ARCHITECTURE.md §3.1 and project decisions 2026-06-06):
 *
 *   Draft  --submitDraft-->  InReview  --approve x N-->  Published   (federated)
 *                                |
 *                                +-----reject---->  Draft (with rejectedContentHash)
 *
 * Rules locked on 2026-06-06:
 *  - Threshold is fixed at 2 approvals (KIND_REVIEW_THRESHOLD).
 *  - On rejection, the letter goes back to Draft AND we store a SHA-256 of the
 *    content at that moment. submitDraft refuses to re-enter the queue while
 *    the current content hashes to the same value — the author must actually
 *    modify their text.
 *  - submitDraft is the *only* action that counts against the 17/day quota;
 *    approving, rejecting and saving a draft are free (see rate-limit middleware).
 *
 * NOTE — this is a stub. The integration with @semapps/ldp (storing the letter,
 * reading current content) and @activitypods/app (publishing via pod-outbox) is
 * left as Phase 1 work. The action surface is final, the bodies will be filled
 * in when the wider stack is wired up.
 */
module.exports = {
  name: 'kind-peer-review',

  settings: {
    threshold: parseInt(process.env.KIND_REVIEW_THRESHOLD || '2', 10)
  },

  actions: {
    /**
     * Move a letter from Draft to InReview.
     * Throws if the content hash matches a prior rejection's hash.
     */
    submitDraft: {
      params: { letterUri: 'string' },
      async handler(ctx) {
        const { letterUri } = ctx.params;
        const letter = await this._fetchLetter(ctx, letterUri);

        if (letter['kind:status'] !== 'kind:Draft') {
          throw new Error(`Letter ${letterUri} is not in Draft state`);
        }

        const hash = this._hashContent(letter);
        if (letter['kind:rejectedContentHash'] === hash) {
          throw new Error(
            'Resubmission blocked: the letter has not been modified since it was rejected'
          );
        }

        await this._patchLetter(ctx, letterUri, {
          'kind:status': 'kind:InReview'
        });

        ctx.emit('kind.letter.submitted', { letterUri, authorWebId: ctx.meta.webId });
      }
    },

    /**
     * Record an approval and, if the threshold is reached, publish via outbox.
     */
    approve: {
      params: { letterUri: 'string' },
      async handler(ctx) {
        const { letterUri } = ctx.params;
        const approverWebId = ctx.meta.webId;

        const letter = await this._fetchLetter(ctx, letterUri);
        if (letter['kind:status'] !== 'kind:InReview') {
          throw new Error('Letter is not awaiting review');
        }

        const author = letter['as:attributedTo'];
        if (approverWebId === author) {
          throw new Error('Authors cannot self-approve');
        }

        const approvers = new Set(this._asArray(letter['kind:approvedBy']));
        if (approvers.has(approverWebId)) return; // idempotent
        approvers.add(approverWebId);

        await this._patchLetter(ctx, letterUri, {
          'kind:approvedBy': [...approvers]
        });

        if (approvers.size >= this.settings.threshold) {
          await this._publish(ctx, letterUri);
        }
      }
    },

    /**
     * Record a rejection: store the content hash, the reason, and bounce the
     * letter back to Draft.
     */
    reject: {
      params: {
        letterUri: 'string',
        reason: { type: 'string', max: 500 }
      },
      async handler(ctx) {
        const { letterUri, reason } = ctx.params;
        const letter = await this._fetchLetter(ctx, letterUri);
        if (letter['kind:status'] !== 'kind:InReview') {
          throw new Error('Letter is not awaiting review');
        }

        await this._patchLetter(ctx, letterUri, {
          'kind:status': 'kind:Draft',
          'kind:rejectedContentHash': this._hashContent(letter),
          'kind:rejectionReason': reason,
          'kind:approvedBy': [] // wipe accumulated approvals
        });

        ctx.emit('kind.letter.rejected', {
          letterUri,
          authorWebId: letter['as:attributedTo'],
          reviewerWebId: ctx.meta.webId,
          reason
        });
      }
    }
  },

  methods: {
    // ----- internal helpers (Phase 1 will plug LDP) ---------------------

    async _fetchLetter(ctx, letterUri) {
      // TODO Phase 1: replace with ctx.call('ldp.resource.get', { resourceUri: letterUri, ... })
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

    async _publish(ctx, letterUri) {
      // Set status to Published, then emit a Create activity in the author's
      // outbox. Audience derives from kind:circle: WAC enforces storage access;
      // we also list each circle member in `to` for federation.
      const letter = await this._fetchLetter(ctx, letterUri);
      await this._patchLetter(ctx, letterUri, {
        'kind:status': 'kind:Published',
        'as:published': new Date().toISOString()
      });

      const audience = await ctx.call('kind-circles.resolveMembers', {
        circleUri: letter['kind:circle']
      });

      return ctx.call('pod-outbox.post', {
        actorUri: letter['as:attributedTo'],
        activity: {
          type: 'Create',
          object: letterUri,
          to: audience
        }
      });
    },

    _hashContent(letter) {
      const payload = JSON.stringify({
        name: letter['as:name'] || letter.name,
        content: letter['as:content'] || letter.content
      });
      return crypto.createHash('sha256').update(payload).digest('hex');
    },

    _asArray(v) {
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    }
  }
};
