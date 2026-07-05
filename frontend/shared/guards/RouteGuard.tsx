
// frontend/shared/guards/RouteGuard.tsx

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { isTokenExpiringSoon } from '@/frontend/modules/auth/utils';
import { authApi } from '@/frontend/modules/auth/services/auth.api';

interface RouteGuardProps {
  children: ReactNode;
  /** Where to send unauthenticated users. Defaults to the login page. */
  redirectTo?: string;
}

/**
 * Client-side gate for pages that require an authenticated session.
 * Complements (does not replace) the server-side checks in
 * middleware.ts and server/middleware/with-auth.ts -- those are the
 * actual security boundary; this just avoids flashing protected UI
 * before redirecting an unauthenticated visitor.
 *
 * Also opportunistically rotates the access token when it's close to
 * expiry, so a long-open tab doesn't suddenly start failing API calls.
 */
export function RouteGuard({ children, redirectTo = '/auth/login' }: RouteGuardProps) {
  const router = useRouter();
  const { isAuthenticated, accessToken, refreshToken, accessTokenExpiresAt, updateTokens, clearSession } =
    useSessionStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(redirectTo);
      return;
    }

    if (accessTokenExpiresAt && refreshToken && isTokenExpiringSoon(accessTokenExpiresAt)) {
      authApi
        .refresh(refreshToken)
        .then((pair) =>
          updateTokens({
            accessToken: pair.accessToken,
            refreshToken: pair.refreshToken,
            accessTokenExpiresAt: pair.accessTokenExpiresAt as unknown as string,
          })
        )
        .catch(() => {
          clearSession();
          router.replace(redirectTo);
        });
    }
  }, [isAuthenticated, accessTokenExpiresAt, refreshToken, redirectTo, router, updateTokens, clearSession]);

  if (!isAuthenticated || !accessToken) {
    return null;
  }

  return <>{children}</>;
}