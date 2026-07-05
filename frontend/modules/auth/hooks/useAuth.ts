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
            tenantId: claims?.tenantId || 'default',
          },
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt!,
          sessionId: result.sessionId,
        });
        setStep('done');
        return { mfaRequired: false as const };
      } catch (err: any) {
        setError(err?.error || 'Login failed. Please check your credentials.');
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