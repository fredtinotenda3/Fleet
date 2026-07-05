
// frontend/modules/auth/services/auth.api.ts
//
// Thin fetch wrapper for every auth/security endpoint this module
// consumes. Deliberately framework-agnostic (no react-query here) so
// the Zustand store and hooks in this module can compose it freely.

import {
  AuthApiError,
  LoginResult,
  MfaEnrollStart,
  MfaStatus,
  SessionListItem,
  SsoDiscoveryResult,
  TokenPair,
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

async function request<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      body?.error?.message || body?.error || 'Request failed';
    const err: AuthApiError = { error: message, code: body?.error?.code };
    throw err;
  }

  // Existing controllers wrap payloads as { success, data }; the
  // anonymous auth routes (forgot/reset-password) return raw JSON.
  return (body?.data !== undefined ? body.data : body) as T;
}

export const authApi = {
  login: (payload: { email: string; password: string; code?: string; backupCode?: string; deviceLabel?: string }) =>
    request<LoginResult>('/auth/token', { method: 'POST', body: JSON.stringify(payload) }),

  refresh: (refreshToken: string, tenantId?: string) =>
    request<TokenPair>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, tenantId }),
    }),

  revoke: (refreshToken: string, tenantId?: string) =>
    request<{ message: string }>('/auth/revoke', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, tenantId }),
    }),

  precheck: (email: string, password: string) =>
    request<{ valid: boolean; mfaRequired?: boolean }>('/auth/precheck', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  discoverSso: (email: string) =>
    request<SsoDiscoveryResult>(`/auth/sso/discover?email=${encodeURIComponent(email)}`),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }, accessToken?: string) =>
    request<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }, accessToken),

  mfaStatus: (accessToken?: string) => request<MfaStatus>('/security/mfa/status', {}, accessToken),

  mfaEnrollStart: (accessToken?: string) =>
    request<MfaEnrollStart>('/security/mfa/enroll', { method: 'POST' }, accessToken),

  mfaEnrollVerify: (code: string, accessToken?: string) =>
    request<{ backupCodes: string[] }>(
      '/security/mfa/enroll/verify',
      { method: 'POST', body: JSON.stringify({ code }) },
      accessToken
    ),

  mfaDisable: (payload: { code?: string; backupCode?: string }, accessToken?: string) =>
    request<{ message: string }>('/security/mfa/disable', { method: 'POST', body: JSON.stringify(payload) }, accessToken),

  mfaRegenerateBackupCodes: (payload: { code?: string; backupCode?: string }, accessToken?: string) =>
    request<{ backupCodes: string[] }>(
      '/security/mfa/backup-codes',
      { method: 'POST', body: JSON.stringify(payload) },
      accessToken
    ),

  listSessions: (accessToken?: string) => request<SessionListItem[]>('/security/sessions', {}, accessToken),

  revokeSession: (id: string, accessToken?: string) =>
    request<{ message: string }>(`/security/sessions/${id}`, { method: 'DELETE' }, accessToken),

  revokeOtherSessions: (accessToken?: string) =>
    request<{ message: string; count: number }>('/security/sessions/revoke-others', { method: 'POST' }, accessToken),
};

