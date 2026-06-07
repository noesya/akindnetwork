// Identity hook with mock fallback.
//
// When a Solid-OIDC session is active, returns the real WebID + profile data.
// When none, returns the mock Alice user from src/data/mock.ts so the design
// prototype keeps working out of the box.

import { useGetIdentity } from 'ra-core';
import { currentUser as mockUser, type User } from '../data/mock';

export type CurrentUser = User & { isMock: boolean };

export function useCurrentUser(): {
  user: CurrentUser;
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useGetIdentity();

  if (isLoading) {
    return { user: { ...mockUser, isMock: true }, isAuthenticated: false, isLoading: true };
  }

  if (data && data.id) {
    // Map react-admin's identity payload onto our User shape.
    const webId = String(data.id);
    return {
      user: {
        id: webId.split('/').pop() ?? 'me',
        webId,
        name: data.fullName || extractName(webId),
        bio: '',
        avatarInitials: initials(data.fullName || webId),
        avatarColor: '#314a62',
        isMock: false
      },
      isAuthenticated: true,
      isLoading: false
    };
  }

  return { user: { ...mockUser, isMock: true }, isAuthenticated: false, isLoading: false };
}

function extractName(webId: string): string {
  // WebIDs come in two flavours on Solid providers:
  //   path-based:      https://armoise.co/arnaudlevy
  //   subdomain-based: https://alice.armoise.co/profile/card#me
  // We try the path's first non-empty segment first (excluding common ones
  // like `profile`); if absent, fall back to the leftmost subdomain.
  try {
    const u = new URL(webId);
    const COMMON = new Set(['profile', 'public', 'data', 'inbox', 'outbox']);
    const seg = u.pathname.split('/').find((p) => p && !COMMON.has(p));
    if (seg) return seg;
    const sub = u.hostname.split('.')[0];
    return sub;
  } catch {
    return webId;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}
