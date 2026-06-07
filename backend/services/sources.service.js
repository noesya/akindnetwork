'use strict';

/**
 * KindSourceService — enriches a kind:Source URL with Open Graph / oEmbed
 * metadata for the source preview modal.
 *
 * Stub for now. Phase 2 will fetch the URL, parse OG tags, cache the result,
 * and apply a server-side rate limit on outbound fetches so a malicious user
 * can't turn Kind into a URL crawler.
 */
module.exports = {
  name: 'kind-sources',

  actions: {
    enrich: {
      params: { url: 'string' },
      async handler(ctx) {
        // TODO Phase 2: fetch and parse OG tags.
        return {
          url: ctx.params.url,
          title: null,
          author: null,
          publisher: null,
          image: null,
          description: null,
          cachedAt: null
        };
      }
    }
  }
};
