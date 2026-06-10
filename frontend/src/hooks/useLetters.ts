// Letter & thread hooks.
//
// When an authenticated user is reading, the data comes from the backend's
// `kind-letters` index — a server-side aggregator that gives us cross-pod
// visibility (a reviewer in pod A can see a letter in pod B because the
// backend already has the AccessGrant to read it). The dataProvider is
// still used for WRITES (the editor saves to the author's own pod) and
// for reading one's own drafts directly.
//
// In demo mode (anonymous visitor) we fall back to `data/mock.ts` so the
// prototype works without a Pod.

import { useEffect, useState } from 'react';
import { letters as mockLetters, comments as mockComments } from '../data/mock';
import { useCurrentUser } from './useCurrentUser';
import { isAuthConfigured } from '../providers/setup';
import type { Letter, Comment } from '../data/mock';
import { fetchById, fetchChildren, fetchFeed, type LetterEntry } from '../lib/lettersApi';
import { toSlug } from '../lib/letterSlug';

const PARAGRAPH_SEPARATOR = /\n{2,}/;

function backendStatusToMock(s: LetterEntry['status']): Letter['status'] {
  if (s === 'pending-review') return 'in-review';
  if (s === 'published') return 'published';
  return 'draft';
}

// Pod-only fields the mock Letter type doesn't carry. We stash them on a
// wider extension type instead of widening the demo Letter shape.
export type LetterWithReview = Letter & {
  // Author's full WebID — needed to gate the review UI ("no self-review")
  // since `authorId` is a non-unique nickname.
  authorWebId?: string;
  // Legacy: present on pre-lazy-assignment letters. Read but never used by
  // current flow (the feed/filter ignores it). Kept on the type to avoid
  // breaking persisted data shape.
  assignedReviewers?: string[];
  approvedByWebIds?: string[];
  rejectedByEntries?: { reviewer: string; comment: string }[];
  inReplyToUri?: string;
  sourceUrls?: string[];
};

function entryToLetter(entry: LetterEntry): LetterWithReview {
  const body = (entry.content || '').trim();
  // Extract a short, stable "authorId" from the WebID so the LetterView's
  // mock `users` map can still match where it can (alice, philippe, …).
  // For unknown authors the WebID itself is fine — LetterView falls back
  // to a stub when the users map doesn't know the id.
  const authorId =
    entry.authorWebId.split('/').filter(Boolean).pop() || entry.authorWebId;
  const created = entry.publishedAt || new Date().toISOString();
  return {
    id: entry.uri,
    authorId,
    authorWebId: entry.authorWebId,
    title: entry.title || '',
    paragraphs: body ? body.split(PARAGRAPH_SEPARATOR) : [],
    language: (entry.language === 'en' ? 'en' : 'fr') as Letter['language'],
    createdAt: created,
    publishedAt: created,
    status: backendStatusToMock(entry.status),
    approvedBy: [], // TODO: surface entry.approvedBy webids once we have name resolution
    sources: [],
    assignedReviewers: entry.assignedReviewers,
    approvedByWebIds: entry.approvedBy,
    rejectedByEntries: entry.rejectedBy,
    inReplyToUri: entry.parentUri || undefined,
    sourceUrls: entry.sources
  };
}

/**
 * Topological filter for the demo (mock) feed. The backend applies the same
 * rule server-side, so we don't reapply it on the live path.
 */
function visibleInFlux(collection: LetterWithReview[]): LetterWithReview[] {
  const childCount = new Map<string, number>();
  for (const l of collection) {
    const parentId = l.respondsTo?.id || l.inReplyToUri;
    if (parentId) childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
  }
  return collection.filter((l) => {
    const hasParent = !!l.respondsTo || !!l.inReplyToUri;
    if (!hasParent) return true;
    return (childCount.get(l.id) ?? 0) > 0;
  });
}

/**
 * The main reading flow. Authenticated → backend index; anonymous → mocks
 * (with the same topological filter applied locally).
 */
export function useLetters(): { letters: LetterWithReview[]; isLoading: boolean } {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated;

  const [data, setData] = useState<LetterWithReview[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(shouldFetch);

  useEffect(() => {
    if (!shouldFetch) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchFeed()
      .then((r) => {
        if (cancelled) return;
        setData(r.letters.map(entryToLetter));
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[useLetters] feed fetch failed:', e?.message || e);
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch]);

  if (!shouldFetch) {
    return {
      letters: visibleInFlux(
        mockLetters.filter((l) => l.status === 'published') as LetterWithReview[]
      ),
      isLoading: false
    };
  }
  return { letters: data, isLoading };
}

/**
 * Resolve a slug-or-id to a Letter. Authenticated → backend by-slug
 * lookup (works cross-pod); anonymous → match against mock data by id.
 */
export function useLetter(slugOrId: string | undefined): {
  letter: LetterWithReview | undefined;
  isLoading: boolean;
} {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch =
    isAuthConfigured && isAuthenticated && Boolean(slugOrId);

  const [letter, setLetter] = useState<LetterWithReview | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(shouldFetch);

  useEffect(() => {
    if (!shouldFetch || !slugOrId) {
      setLetter(undefined);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    // The caller may pass either a bare UUID (the URL token) or a full
    // Solid URI (legacy callsites). toSlug reduces both to the UUID,
    // which is what the backend's `/kind/letters/:id` route expects.
    const id = toSlug(slugOrId);
    fetchById(id)
      .then((e) => {
        if (!cancelled) setLetter(entryToLetter(e));
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[useLetter] byId failed:', e?.message || e);
        setLetter(undefined);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, slugOrId]);

  if (!isAuthConfigured || !isAuthenticated) {
    return {
      letter: mockLetters.find((l) => l.id === slugOrId) as
        | LetterWithReview
        | undefined,
      isLoading: false
    };
  }
  return { letter, isLoading };
}

/**
 * All published letters that reply to `parentUri`, sorted chronologically.
 * Authenticated → backend cross-pod query; anonymous → mock fallback.
 */
export function useChildren(parentUri: string | undefined): {
  children: LetterWithReview[];
  isLoading: boolean;
} {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch =
    isAuthConfigured && isAuthenticated && Boolean(parentUri);

  const [children, setChildren] = useState<LetterWithReview[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(shouldFetch);

  useEffect(() => {
    if (!shouldFetch || !parentUri) {
      setChildren([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    // useChildren is called with the parent's full Solid URI (since hooks
    // sit between the LetterView's `letter.id` and the backend). Strip to
    // the UUID for the REST path.
    fetchChildren(toSlug(parentUri))
      .then((r) => {
        if (!cancelled) setChildren(r.letters.map(entryToLetter));
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[useChildren] fetch failed:', e?.message || e);
        setChildren([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, parentUri]);

  if (!shouldFetch || !parentUri) {
    const matched = (mockLetters as LetterWithReview[]).filter(
      (l) => l.respondsTo?.id === parentUri && l.status === 'published'
    );
    return { children: matched, isLoading: false };
  }
  return { children, isLoading };
}

export function useComments(letterId: string | undefined): {
  comments: Comment[];
  isLoading: boolean;
} {
  const { isAuthenticated } = useCurrentUser();
  // Inline comments aren't part of the indexed feed — Kind's discussion
  // happens via full reply letters (see useChildren). The Thread component
  // still expects a list, so we return mocks in demo mode and an empty
  // array on the live path.
  if (!(isAuthConfigured && isAuthenticated) || !letterId) {
    return {
      comments: mockComments.filter((c) => c.letterId === letterId),
      isLoading: false
    };
  }
  return { comments: [], isLoading: false };
}
