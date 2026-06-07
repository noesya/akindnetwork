import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * Gate a route on an authenticated Solid session. Anonymous visitors get sent
 * to /me, which is the single entry point for everything Pod-connection
 * related (login button if auth is configured, instructions otherwise).
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/me" replace />;
  return <>{children}</>;
}
