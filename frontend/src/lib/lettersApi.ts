// Thin HTTP client for the Kind backend's `kind-letters` index. The frontend
// fetches the read flow from here instead of querying the pod directly via
// the dataProvider — that path can only see Letters in the CALLER's own pod,
// while the index aggregates every letter the network knows about and serves
// them back with the bodies already read through the author's AccessGrant.
//
// The dataProvider stays in use for WRITES (the author saves to their own
// pod) and for reading one's own drafts (which never leave one's pod).

const BACKEND_URL =
  import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org';

export type LetterEntry = {
  uri: string;
  uuid: string; // last path segment of the URI — the URL token
  authorWebId: string;
  parentUri: string | null;
  status: 'draft' | 'pending-review' | 'published' | 'rejected';
  publishedAt: string | null;
  title: string;
  content: string;
  language: string;
  sources: string[];
  approvedBy: string[];
  rejectedBy: Array<{ reviewer: string; comment: string }>;
  assignedReviewers: string[];
};

export type FeedResponse = { letters: LetterEntry[]; total: number };

async function call<T>(path: string): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BACKEND_URL}${path}`, { headers });
  if (!r.ok) {
    let detail: any = null;
    try {
      detail = await r.json();
    } catch {
      /* not JSON */
    }
    const message = detail?.message || `HTTP ${r.status} ${r.statusText}`;
    throw new Error(message);
  }
  return r.json();
}

/**
 * Public feed for the current viewer:
 *   - pending-review letters I can vote on (not the author, haven't voted
 *     yet) — sorted to the TOP so the review backlog is visible first;
 *   - every published letter (with topological filter applied server-side)
 *     — sorted publishedAt desc within that group.
 *
 * Anonymous viewers only see published letters.
 */
export function fetchFeed(): Promise<FeedResponse> {
  return call<FeedResponse>('/letters/feed');
}

/**
 * Published children of a given letter, sorted chronologically. The parent
 * is identified by its UUID (the URL token, not the full Solid URI).
 * Backend returns full entries (with body) so the LetterView can render
 * them inline without a second fetch per reply.
 */
export function fetchChildren(parentId: string): Promise<FeedResponse> {
  return call<FeedResponse>(
    `/letters/${encodeURIComponent(parentId)}/children`
  );
}

/**
 * Single letter by UUID — lets /read/<id> work even when the letter lives
 * in another pod, since the index has a global UUID → URI map.
 */
export function fetchById(id: string): Promise<LetterEntry> {
  return call<LetterEntry>(`/letters/${encodeURIComponent(id)}`);
}

/**
 * Every published letter by a given author, identified by the last path
 * segment of their WebID (e.g. "arnaudlevy"). Used by the `/u/:username`
 * profile page.
 */
export function fetchByAuthor(username: string): Promise<FeedResponse> {
  return call<FeedResponse>(`/letters/by-author/${encodeURIComponent(username)}`);
}
