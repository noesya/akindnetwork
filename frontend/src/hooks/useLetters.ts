// Letter & thread hooks with mock fallback.
//
// Strategy: if the user is authenticated AND auth is configured, fetch real
// letters via the SemApps data provider. Otherwise return the mock letters
// from src/data/mock.ts so the prototype renders identically without a Pod.
//
// Pod letters are stored as as:Note (shape tree as/Note) with our minimal
// `kind:` overlay: { name, content, kind:status, kind:language }. The mock
// `Letter` type carries much richer fields (paragraphs, sources, approvedBy,
// respondsTo…). We adapt Pod letters to that shape here so that the existing
// LetterView/MePage components keep working with both data sources. Fields
// the Pod doesn't carry yet are defaulted to empty/safe values.
//
// Phase 1 will refine the queries: an authenticated user reads from their
// AS inbox (federated letters) and from the public outboxes of people they
// approved. For now we just call getList on the Letter resource.

import { useGetList, useGetOne } from 'ra-core';
import { letters as mockLetters, comments as mockComments } from '../data/mock';
import { useCurrentUser, type CurrentUser } from './useCurrentUser';
import { isAuthConfigured } from '../providers/setup';
import type { Letter, Comment } from '../data/mock';
import { fromSlug } from '../lib/letterSlug';

type PodLetter = {
  id: string;
  name?: string;
  content?: string;
  'kind:status'?: 'draft' | 'pending-review' | 'published' | 'rejected';
  'kind:language'?: string;
  'kind:sources'?: string | string[];
  'kind:assignedReviewers'?: string | string[];
  'kind:approvedBy'?: string | string[];
  'kind:rejectedBy'?:
    | { reviewer: string; comment: string }
    | { reviewer: string; comment: string }[];
  'dc:created'?: string;
  'dc:modified'?: string;
  attributedTo?: string;
  inReplyTo?: string;
};

// JSON-LD predicates can deserialize to a single object OR an array depending
// on cardinality. Normalize so consumer code can always .filter/.map.
const arrayOf = <T,>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

const PARAGRAPH_SEPARATOR = /\n{2,}/;

function podStatusToMock(s: PodLetter['kind:status']): Letter['status'] {
  if (s === 'pending-review') return 'in-review';
  if (s === 'published') return 'published';
  return 'draft';
}

// Pod-only fields that LetterView doesn't know about yet but the review UI
// needs. We stash them on the Letter via an extension type rather than
// widening the mock-side Letter shape (keeps the demo simple).
export type LetterWithReview = Letter & {
  assignedReviewers?: string[];
  approvedByWebIds?: string[];
  rejectedByEntries?: { reviewer: string; comment: string }[];
  // Raw URI of the letter this one replies to (`as:inReplyTo`). Mock letters
  // use the richer `respondsTo: {id, title, authorId, publishedAt}` object;
  // Pod letters carry only the URI and LetterView fetches the parent's title
  // separately via useLetter.
  inReplyToUri?: string;
  // Flat array of source URLs. Mock letters use the richer Source[] shape
  // (with title/author/publisher); Pod letters keep it minimal (URLs only,
  // per product decision).
  sourceUrls?: string[];
};

function podLetterToLetter(p: PodLetter, currentUser: CurrentUser): LetterWithReview {
  const created = p['dc:created'] || new Date().toISOString();
  const body = (p.content || '').trim();
  return {
    id: p.id,
    authorId: currentUser.id,
    title: p.name || '',
    paragraphs: body ? body.split(PARAGRAPH_SEPARATOR) : [],
    language: (p['kind:language'] === 'en' ? 'en' : 'fr') as Letter['language'],
    createdAt: created,
    publishedAt: p['dc:modified'] || created,
    status: podStatusToMock(p['kind:status']),
    approvedBy: [],
    sources: [],
    assignedReviewers: arrayOf(p['kind:assignedReviewers']),
    approvedByWebIds: arrayOf(p['kind:approvedBy']),
    rejectedByEntries: arrayOf(p['kind:rejectedBy']),
    inReplyToUri: p.inReplyTo || undefined,
    sourceUrls: arrayOf(p['kind:sources']).filter(
      (u): u is string => typeof u === 'string' && u.startsWith('http')
    )
  };
}

export function useLetters(): { letters: Letter[]; isLoading: boolean } {
  const { user, isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated;

  const { data, isLoading } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 50 },
      // dc:modified is one of the few predicates SemApps reliably indexes —
      // safer than `published` which doesn't exist in our minimal model.
      sort: { field: 'dc:modified', order: 'DESC' }
    },
    { enabled: shouldFetch }
  );

  // `/read` shows two kinds of letters:
  //  - Published ones (the public flow).
  //  - Pending-review ones I'm personally assigned to and haven't voted on
  //    yet. They appear in the same stream so I encounter them naturally
  //    while reading; this matches the user's choice 4B (no separate review
  //    queue). Filter logic mirrors what the LetterView uses to decide
  //    whether to show approve/reject buttons.
  const visibleToMe = (l: LetterWithReview) => {
    if (l.status === 'published') return true;
    if (l.status !== 'in-review') return false;
    if (!user.webId) return false;
    const assigned = l.assignedReviewers ?? [];
    const approved = l.approvedByWebIds ?? [];
    const rejected = (l.rejectedByEntries ?? []).map((r) => r.reviewer);
    return assigned.includes(user.webId) && !approved.includes(user.webId) && !rejected.includes(user.webId);
  };

  if (!shouldFetch) {
    return {
      letters: mockLetters.filter((l) => l.status === 'published'),
      isLoading: false
    };
  }
  const adapted = (data ?? []).map((p) => podLetterToLetter(p, user));
  return { letters: adapted.filter(visibleToMe), isLoading };
}

export function useLetter(slugOrId: string | undefined): {
  letter: LetterWithReview | undefined;
  isLoading: boolean;
} {
  const { user, isAuthenticated } = useCurrentUser();
  // The URL carries the short slug; rebuild the full Solid URI for the
  // dataProvider. fromSlug returns the input unchanged if it's already a URI
  // (mock id "letter-1" stays as-is for the demo fallback).
  const fullId = slugOrId ? fromSlug(slugOrId, user.storage) : undefined;
  // Don't fire useGetOne on a bare slug — we'd 404. Wait until storage is
  // known and we have a proper http URI.
  const shouldFetch =
    isAuthConfigured && isAuthenticated && !!fullId && fullId.startsWith('http');

  const { data, isLoading } = useGetOne<PodLetter>(
    'Letter',
    { id: fullId ?? '' },
    { enabled: shouldFetch }
  );

  if (!isAuthConfigured || !isAuthenticated) {
    return { letter: mockLetters.find((l) => l.id === slugOrId), isLoading: false };
  }
  if (!data) return { letter: undefined, isLoading };
  return { letter: podLetterToLetter(data, user), isLoading: false };
}

/**
 * All letters that reply to `parentUri` (i.e. whose `as:inReplyTo` points
 * at it), sorted chronologically (oldest → newest). When the user isn't
 * authenticated, falls back to the mock data so the demo prototype keeps
 * showing thread structure on the read page.
 *
 * The query is intentionally unfiltered server-side: SemApps' filter
 * support for arbitrary predicates is uneven, and the user's "letters they
 * can read" set is already bounded by WAC. We fetch what they can see and
 * filter client-side.
 */
export function useChildren(parentUri: string | undefined): {
  children: LetterWithReview[];
  isLoading: boolean;
} {
  const { user, isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated && Boolean(parentUri);

  const { data, isLoading } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: 'dc:created', order: 'ASC' }
    },
    { enabled: shouldFetch }
  );

  if (!shouldFetch || !parentUri) {
    // Mock fallback — find letters whose respondsTo.id matches the parent.
    const matched = (mockLetters as LetterWithReview[]).filter(
      (l) => l.respondsTo?.id === parentUri && l.status === 'published'
    );
    return { children: matched, isLoading: false };
  }

  const matched = (data ?? [])
    .filter((p) => p.inReplyTo === parentUri && p['kind:status'] === 'published')
    .map((p) => podLetterToLetter(p, user));
  return { children: matched, isLoading };
}

/**
 * Count of how many published letters reply (directly) to each given URI.
 * Returns a Map<parentUri, number>. Used by the read flow to show a "N
 * réponses" badge next to a letter without N+1 queries.
 */
export function useChildCounts(): { counts: Map<string, number>; isLoading: boolean } {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated;

  const { data, isLoading } = useGetList<PodLetter>(
    'Letter',
    { pagination: { page: 1, perPage: 200 }, sort: { field: 'dc:created', order: 'ASC' } },
    { enabled: shouldFetch }
  );

  const counts = new Map<string, number>();
  const source: PodLetter[] = shouldFetch
    ? data ?? []
    : (mockLetters as any[]).map((l) => ({
        id: l.id,
        inReplyTo: l.respondsTo?.id,
        'kind:status': l.status === 'in-review' ? 'pending-review' : l.status
      }));
  for (const p of source) {
    if (p.inReplyTo && p['kind:status'] === 'published') {
      counts.set(p.inReplyTo, (counts.get(p.inReplyTo) ?? 0) + 1);
    }
  }
  return { counts, isLoading };
}

export function useComments(letterId: string | undefined): {
  comments: Comment[];
  isLoading: boolean;
} {
  const { isAuthenticated } = useCurrentUser();
  // Phase 1: queries the `as:replies` collection of the letter. For now mock only.
  if (!(isAuthConfigured && isAuthenticated) || !letterId) {
    return {
      comments: mockComments.filter((c) => c.letterId === letterId),
      isLoading: false
    };
  }
  return { comments: [], isLoading: false };
}
