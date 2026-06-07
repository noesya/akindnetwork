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
  try {
    const u = new URL(webId);
    return u.hostname.split('.')[0];
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
