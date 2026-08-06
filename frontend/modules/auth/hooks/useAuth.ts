// frontend/modules/auth/hooks/useAuth.ts

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../services/auth.api';
import { useAuthFlowStore } from '../store/auth.store';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { decodeAccessTokenClaims } from '../utils';

export function useAuth() {
  const router = useRouter();
  const { step, isLoading, error, setStep, setLoading, setError, setPendingCredentials, reset } = useAuthFlowStore();
  const { user, isAuthenticated, setSession, clearSession, accessToken } = useSessionStore();

  const login = useCallback(
    async (email: string, password: string, code?: string, backupCode?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await authApi.login({ email, password, code, backupCode });

        if (result.mfaRequired) {
          setPendingCredentials(email, password);
          setStep('mfa');
          return { mfaRequired: true as const };
        }

        if (!result.accessToken || !result.refreshToken || !result.sessionId) {
          throw new Error('Unexpected login response');
        }

        const claims = decodeAccessTokenClaims(result.accessToken);
        setSession({
          user: {
            id: claims?.userId || '',
            email: claims?.email || email,
            roles: claims?.roles || [],
            /**
             * FIX (fail-open sentinel, client side). Was
             * `claims?.tenantId || 'default'`. This is the same
             * fail-open pattern that caused the original cross-tenant
             * leak on the server, mirrored into the browser session: a
             * token with no tenant claim silently became 'default',
             * which every scoped UI query then sent to the API.
             *
             * A missing tenant claim is now carried as an empty string.
             * The server never trusts this value for scoping anyway --
             * it re-derives scope from the token on every request -- but
             * a sentinel here made the client display, and cache, data
             * under a tenant that does not exist.
             */
            tenantId: claims?.tenantId ?? '',
          },
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt!,
          sessionId: result.sessionId,
        });
        setStep('done');
        return { mfaRequired: false as const };
      } catch (err: any) {
        /**
         * FIX (internal error disclosure on the sign-in form). This
         * rendered the server's error text verbatim to an
         * unauthenticated visitor. A tenant-scope failure produced:
         *
         *   Rejected legacy sentinel tenant id "default". This value used
         *   to disable tenant filtering entirely... run: npm run
         *   db:backfill-user-tenants
         *
         * -- leaking internal architecture, an internal script name, and
         * the fact that this specific account exists but is misconfigured.
         *
         * Authentication failures now show one generic message regardless
         * of cause, so the form cannot be used to probe account state. The
         * real reason is logged server-side for operators.
         */
        console.error('[useAuth] Login failed:', err);
        setError(
          err?.userFacingMessage ||
            'Sign-in failed. Check your email and password, or contact your administrator if the problem continues.'
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setPendingCredentials, setStep, setSession]
  );

  const submitMfaCode = useCallback(
    async (code?: string, backupCode?: string) => {
      const { pendingEmail, pendingPassword } = useAuthFlowStore.getState();
      if (!pendingEmail || !pendingPassword) {
        throw new Error('No pending login to complete');
      }
      return login(pendingEmail, pendingPassword, code, backupCode);
    },
    [login]
  );

  const logout = useCallback(async () => {
    const { refreshToken } = useSessionStore.getState();
    try {
      if (refreshToken) {
        await authApi.revoke(refreshToken);
      }
    } catch {
      // Best-effort: clear local state regardless of server outcome.
    } finally {
      clearSession();
      reset();
      router.push('/auth/login');
    }
  }, [clearSession, reset, router]);

  return {
    user,
    isAuthenticated,
    accessToken,
    step,
    isLoading,
    error,
    login,
    submitMfaCode,
    logout,
  };
}