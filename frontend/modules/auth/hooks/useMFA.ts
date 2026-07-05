
// frontend/modules/auth/hooks/useMFA.ts

'use client';

import { useCallback, useState } from 'react';
import { authApi } from '../services/auth.api';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { MfaEnrollStart, MfaStatus } from '../types';

export function useMFA() {
  const { accessToken } = useSessionStore();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollStart | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.mfaStatus(accessToken || undefined);
      setStatus(result);
      return result;
    } catch (err: any) {
      setError(err?.error || 'Failed to load MFA status');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const startEnrollment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.mfaEnrollStart(accessToken || undefined);
      setEnrollment(result);
      return result;
    } catch (err: any) {
      setError(err?.error || 'Failed to start MFA enrollment');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const verifyEnrollment = useCallback(
    async (code: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authApi.mfaEnrollVerify(code, accessToken || undefined);
        setBackupCodes(result.backupCodes);
        await fetchStatus();
        return result;
      } catch (err: any) {
        setError(err?.error || 'Invalid verification code');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, fetchStatus]
  );

  const disableMfa = useCallback(
    async (code?: string, backupCode?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await authApi.mfaDisable({ code, backupCode }, accessToken || undefined);
        await fetchStatus();
      } catch (err: any) {
        setError(err?.error || 'Failed to disable MFA');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, fetchStatus]
  );

  const regenerateBackupCodes = useCallback(
    async (code?: string, backupCode?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authApi.mfaRegenerateBackupCodes({ code, backupCode }, accessToken || undefined);
        setBackupCodes(result.backupCodes);
        return result.backupCodes;
      } catch (err: any) {
        setError(err?.error || 'Failed to regenerate backup codes');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken]
  );

  return {
    status,
    enrollment,
    backupCodes,
    isLoading,
    error,
    fetchStatus,
    startEnrollment,
    verifyEnrollment,
    disableMfa,
    regenerateBackupCodes,
  };
}
