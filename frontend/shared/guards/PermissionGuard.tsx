
// frontend/shared/guards/PermissionGuard.tsx

'use client';

import type { ReactNode } from 'react';
import { useSessionStore } from '@/frontend/shared/store/session.store';

interface PermissionGuardProps {
  children: ReactNode;
  /** Roles allowed to see the wrapped content. Empty/omitted = any authenticated user. */
  roles?: string[];
  fallback?: ReactNode;
}

/**
 * Purely a UI convenience for hiding/showing elements based on the
 * roles embedded in the current access token's claims (see
 * frontend/modules/auth/utils.ts). This is NOT an authorization
 * boundary -- every corresponding API route re-checks permissions
 * server-side via server/middleware/with-auth.ts, which is the actual
 * enforcement point.
 */
export function PermissionGuard({ children, roles, fallback = null }: PermissionGuardProps) {
  const { user } = useSessionStore();

  if (!user) return <>{fallback}</>;
  if (!roles || roles.length === 0) return <>{children}</>;

  const hasRole = user.roles?.some((r) => roles.includes(r));
  return hasRole ? <>{children}</> : <>{fallback}</>;
}