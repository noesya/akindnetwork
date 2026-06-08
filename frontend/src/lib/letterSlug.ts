// Convert between a Letter's full Solid URI and a URL-safe slug.
//
// In SAI, every resource is identified by its full URI — there are no opaque
// IDs we can use. Reflecting that URI in our router (eg. /write/<encoded URI>)
// produces ugly addresses like /write/https%3A%2F%2Farmoise.co%2Farnaudlevy%2Fdata%2F….
//
// Letters live as direct children of the user's `pim:storage` container
// (eg. https://armoise.co/arnaudlevy/data/<uuid>). So the URI's last path
// segment alone uniquely identifies the resource, given that we know the
// user's storage URL — which we get from their WebID document and read via
// useCurrentUser().
//
// `toSlug` and `fromSlug` are a pair: round-tripping a URI through them
// returns the original URI, as long as the resource lives under
// `userStorage`. If the resource is hosted somewhere else (a federated
// Letter shared into the user's pod, say), `fromSlug` returns the slug as-is
// and the dataProvider tries to fetch it — which will fail; in that case the
// caller should pass the full URI through (toSlug also accepts non-URI input
// for backward compatibility).

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

export function toSlug(letterId: string): string {
  if (!letterId) return '';
  if (letterId.startsWith('http')) {
    const last = letterId.split('/').filter(Boolean).pop();
    return last || letterId;
  }
  return letterId;
}

export function fromSlug(slug: string, userStorage?: string): string {
  if (!slug) return '';
  // Already a full URI (e.g. legacy URL with encoded URI, or external
  // reference) — use as-is.
  if (slug.startsWith('http')) return slug;
  // No storage known yet: caller should wait. Returning the bare slug would
  // make the dataProvider fail with a misleading 404, so we just bubble up.
  if (!userStorage) return slug;
  return `${stripTrailingSlash(userStorage)}/${slug}`;
}
