'use strict';

/**
 * KindCirclesService — manages interest circles (the Kind name for small,
 * self-managed audience groups).
 *
 * Each Kind circle maps one-to-one onto a Solid WAC group exposed by
 * @semapps/webacl / @activitypods/app's PodWacGroupsService. The Kind layer
 * adds:
 *   - the `kind:circleOwner` predicate (unique, transferable)
 *   - the invite / removeMember / transferOwnership / delete action surface
 *
 * Self-management policy (decision 2026-06-06):
 *   the creator owns the circle outright and can transfer that ownership to
 *   any current member. There is no central moderation.
 */
module.exports = {
  name: 'kind-circles',

  actions: {
    /** Create a circle and back it with a WAC group. */
    create: {
      params: {
        name: 'string',
        description: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const owner = ctx.meta.webId;
        const slug = this._slugify(ctx.params.name);

        const groupUri = await ctx.call('pod-wac-groups.create', {
          groupSlug: slug,
          actorUri: owner
        });

        const circleUri = await ctx.call('ldp.resource.post', {
          containerUri: `${owner}/data/kind/circles`,
          resource: {
            '@type': 'kind:Circle',
            'as:name': ctx.params.name,
            'as:summary': ctx.params.description,
            'kind:circleOwner': owner,
            'apods:wacGroup': groupUri
          },
          contentType: 'application/ld+json'
        });

        return { circleUri, groupUri };
      }
    },

    /** Add a member. Owner-only. */
    invite: {
      params: { circleUri: 'string', memberWebId: 'string' },
      async handler(ctx) {
        await this._assertOwner(ctx);
        const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
        await ctx.call('pod-wac-groups.addMember', {
          groupUri: circle['apods:wacGroup'],
          memberUri: ctx.params.memberWebId,
          actorUri: ctx.meta.webId
        });
        // Best-effort: notify the new member via an Invite activity.
        ctx.call('pod-outbox.post', {
          actorUri: ctx.meta.webId,
          activity: {
            type: 'Invite',
            object: ctx.params.circleUri,
            target: ctx.params.memberWebId
          }
        }).catch((e) => this.logger.warn('Invite delivery failed', e));
      }
    },

    /** Remove a member. Owner-only. */
    removeMember: {
      params: { circleUri: 'string', memberWebId: 'string' },
      async handler(ctx) {
        await this._assertOwner(ctx);
        const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
        await ctx.call('pod-wac-groups.removeMember', {
          groupUri: circle['apods:wacGroup'],
          memberUri: ctx.params.memberWebId,
          actorUri: ctx.meta.webId
        });
      }
    },

    /** Hand the circle to another member. Owner-only. New owner must be a member. */
    transferOwnership: {
      params: { circleUri: 'string', newOwnerWebId: 'string' },
      async handler(ctx) {
        await this._assertOwner(ctx);
        const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
        const members = await ctx.call('pod-wac-groups.list', {
          groupUri: circle['apods:wacGroup']
        });
        if (!members.includes(ctx.params.newOwnerWebId)) {
          throw new Error('New owner must be an existing member of the circle');
        }
        await ctx.call('ldp.resource.patch', {
          resource: {
            id: ctx.params.circleUri,
            'kind:circleOwner': ctx.params.newOwnerWebId
          },
          contentType: 'application/ld+json'
        });
      }
    },

    /** Resolve all WebIDs that belong to a circle (used by PeerReview._publish). */
    resolveMembers: {
      params: { circleUri: 'string' },
      async handler(ctx) {
        const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
        return ctx.call('pod-wac-groups.list', {
          groupUri: circle['apods:wacGroup']
        });
      }
    },

    /** Destroy the circle and its backing group. Owner-only. */
    delete: {
      params: { circleUri: 'string' },
      async handler(ctx) {
        await this._assertOwner(ctx);
        const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
        await ctx.call('pod-wac-groups.delete', {
          groupUri: circle['apods:wacGroup'],
          actorUri: ctx.meta.webId
        });
        await ctx.call('ldp.resource.delete', { resourceUri: ctx.params.circleUri });
      }
    }
  },

  methods: {
    async _fetchCircle(ctx, circleUri) {
      return ctx.call('ldp.resource.get', {
        resourceUri: circleUri,
        accept: 'application/ld+json'
      });
    },

    async _assertOwner(ctx) {
      const circle = await this._fetchCircle(ctx, ctx.params.circleUri);
      if (circle['kind:circleOwner'] !== ctx.meta.webId) {
        throw new Error('Only the circle owner may perform this action');
      }
    },

    _slugify(s) {
      return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    }
  }
};
