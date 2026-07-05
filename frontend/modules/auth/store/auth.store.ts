
// frontend/modules/auth/store/auth.store.ts
//
// Owns transient auth-*flow* state: what step of login/MFA/reset the
// user is on, and in-flight loading/error state for this module's
// forms. Durable "who is logged in" state lives in
// frontend/shared/store/session.store.ts, which this store writes to
// once a login flow completes.

import { create } from 'zustand';

export type AuthStep = 'credentials' | 'mfa' | 'done';

interface AuthFlowState {
  step: AuthStep;
  pendingEmail: string | null;
  pendingPassword: string | null;
  isLoading: boolean;
  error: string | null;
  setStep: (step: AuthStep) => void;
  setPendingCredentials: (email: string, password: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  step: 'credentials',
  pendingEmail: null,
  pendingPassword: null,
  isLoading: false,
  error: null,
  setStep: (step) => set({ step }),
  setPendingCredentials: (email, password) => set({ pendingEmail: email, pendingPassword: password }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ step: 'credentials', pendingEmail: null, pendingPassword: null, isLoading: false, error: null }),
}));


