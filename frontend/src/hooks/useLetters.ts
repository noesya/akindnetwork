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
  'kind:status'?: 'draft' | 'pending-review' | 'published';
  'kind:language'?: string;
  'dc:created'?: string;
  'dc:modified'?: string;
  attributedTo?: string;
  inReplyTo?: string;
};

const PARAGRAPH_SEPARATOR = /\n{2,}/;

function podStatusToMock(s: PodLetter['kind:status']): Letter['status'] {
  if (s === 'pending-review') return 'in-review';
  if (s === 'published') return 'published';
  return 'draft';
}

function podLetterToLetter(p: PodLetter, currentUser: CurrentUser): Letter {
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
    sources: []
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

  if (!shouldFetch) return { letters: mockLetters, isLoading: false };
  const adapted = (data ?? []).map((p) => podLetterToLetter(p, user));
  return { letters: adapted, isLoading };
}

export function useLetter(slugOrId: string | undefined): {
  letter: Letter | undefined;
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
