// Letter & thread hooks with mock fallback.
//
// Strategy: if the user is authenticated AND auth is configured, fetch real
// letters via the SemApps data provider. Otherwise return the mock letters
// from src/data/mock.ts so the prototype renders identically without a Pod.
//
// Phase 1 will refine the queries: an authenticated user reads from their
// AS inbox (federated letters) and from the public outboxes of people they
// approved. For now we just call getList on the Letter resource.

import { useGetList, useGetOne } from 'ra-core';
import { letters as mockLetters, comments as mockComments } from '../data/mock';
import { useCurrentUser } from './useCurrentUser';
import { isAuthConfigured } from '../providers/setup';
import type { Letter, Comment } from '../data/mock';

export function useLetters(): { letters: Letter[]; isLoading: boolean } {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated;

  const { data, isLoading } = useGetList<Letter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: 'published', order: 'DESC' }
    },
    { enabled: shouldFetch }
  );

  if (!shouldFetch) return { letters: mockLetters, isLoading: false };
  return { letters: data ?? [], isLoading };
}

export function useLetter(id: string | undefined): {
  letter: Letter | undefined;
  isLoading: boolean;
} {
  const { isAuthenticated } = useCurrentUser();
  const shouldFetch = isAuthConfigured && isAuthenticated && Boolean(id);

  const { data, isLoading } = useGetOne<Letter>(
    'Letter',
    { id: id ?? '' },
    { enabled: shouldFetch }
  );

  if (!shouldFetch) {
    return { letter: mockLetters.find((l) => l.id === id), isLoading: false };
  }
  return { letter: data, isLoading };
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
