
// frontend/shared/store/session.store.ts
//
// App-wide session state. Holds the programmatic-client token pair
// issued by /api/auth/token (see infrastructure/security/token.service.ts)
// for clients that use it instead of / alongside the NextAuth cookie
// session. Kept separate from frontend/modules/auth/store/auth.store.ts,
// which owns auth *flow* state (login/MFA/reset in progress); this
// store is the durable "am I logged in, what's my token" source of
// truth other shared modules (api-client, guards) read from.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/frontend/modules/auth/types';

interface SessionState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  setSession: (payload: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    sessionId: string;
  }) => void;
  updateTokens: (payload: { accessToken: string; refreshToken: string; accessTokenExpiresAt: string }) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      sessionId: null,
      isAuthenticated: false,

      setSession: ({ user, accessToken, refreshToken, accessTokenExpiresAt, sessionId }) =>
        set({
          user,
          accessToken,
          refreshToken,
          accessTokenExpiresAt,
          sessionId,
          isAuthenticated: true,
        }),

      updateTokens: ({ accessToken, refreshToken, accessTokenExpiresAt }) =>
        set((state) => ({
          ...state,
          accessToken,
          refreshToken,
          accessTokenExpiresAt,
        })),

      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          sessionId: null,
          isAuthenticated: false,
        }),
    }),
    { name: 'fleet-session' }
  )
);
