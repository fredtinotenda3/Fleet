// frontend/modules/auth/hooks/useSessions.ts

'use client';

import { useCallback, useState } from 'react';
import { authApi } from '../services/auth.api';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { SessionListItem } from '../types';

export function useSessions() {
  const { accessToken } = useSessionStore();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.listSessions(accessToken || undefined);
      setSessions(result);
      return result;
    } catch (err: any) {
      setError(err?.error || 'Failed to load sessions');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const revoke = useCallback(
    async (id: string) => {
      await authApi.revokeSession(id, accessToken || undefined);
      setSessions((prev) => prev.filter((s) => s._id !== id));
    },
    [accessToken]
  );

  const revokeOthers = useCallback(async () => {
    await authApi.revokeOtherSessions(accessToken || undefined);
    await refresh();
  }, [accessToken, refresh]);

  return { sessions, isLoading, error, refresh, revoke, revokeOthers };
}