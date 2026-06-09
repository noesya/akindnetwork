// Identity hook with mock fallback.
//
// When a Solid-OIDC session is active, returns the real WebID + profile data.
// When none, returns the mock Alice user from src/data/mock.ts so the design
// prototype keeps working out of the box.

import { useGetIdentity } from 'ra-core';
import jwtDecode from 'jwt-decode';
import { currentUser as mockUser, type User } from '../data/mock';

/**
 * Synchronous look at the JWT in localStorage so we can answer
 * "is the user logged in?" BEFORE useGetIdentity finishes its async
 * webId-document fetch. Without this, every page refresh would flash
 * the mock data while identity loads.
 */
function extractTokenSession(): { webId: string } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = jwtDecode<{ webid?: string; webId?: string }>(token) as any;
    const webId = payload?.webid || payload?.webId;
    return webId ? { webId } : null;
  } catch {
    return null;
  }
}

// `storage` is the user's `pim:storage` URI — the container under which all
// of their resources live (Letters, profile, etc.). Lifted out of the WebID
// document by SemApps' getIdentity, surfaced here so the rest of the app
// (LetterEditor, MePage…) can build short Solid URIs without re-fetching it.
export type CurrentUser = User & { isMock: boolean; storage?: string };

export function useCurrentUser(): {
  user: CurrentUser;
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useGetIdentity();
  const tokenSession = extractTokenSession();

  if (isLoading) {
    // While the identity is still resolving, we already know from the
    // JWT in localStorage whether the user IS logged in. Surface that
    // synchronously so downstream hooks (useLetters etc.) don't fall back
    // to mocks during the load and cause a visible flash. We can also
    // derive the user.id + webId from the token claims; profile data
    // (name, bio, avatar) will arrive in the second render below.
    if (tokenSession) {
      const { webId } = tokenSession;
      return {
        user: {
          id: webId.split('/').pop() ?? 'me',
          webId,
          name: extractName(webId),
          bio: '',
          avatarInitials: initials(webId),
          avatarColor: '#314a62',
          isMock: false
        },
        isAuthenticated: true,
        isLoading: true
      };
    }
    return { user: { ...mockUser, isMock: true }, isAuthenticated: false, isLoading: true };
  }

  if (data && data.id) {
    // Map react-admin's identity payload onto our User shape.
    const webId = String(data.id);
    const webIdData = (data as any).webIdData || {};
    const storage: string | undefined =
      webIdData['pim:storage'] || webIdData.storage;
    // SemApps' getIdentity already collapses vcard:photo / foaf:img / as:icon
    // (which can be a string OR an object with a .url) into a single `avatar`
    // field. Accept whatever it gives us and let the Avatar component decide
    // how to render.
    const avatarRaw: any = (data as any).avatar;
    const avatarUrl: string | undefined =
      typeof avatarRaw === 'string'
        ? avatarRaw
        : avatarRaw?.url || avatarRaw?.id || undefined;
    return {
      user: {
        id: webId.split('/').pop() ?? 'me',
        webId,
        name: data.fullName || extractName(webId),
        bio: '',
        avatarInitials: initials(data.fullName || webId),
        avatarColor: '#314a62',
        avatarUrl,
        isMock: false,
        storage
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
