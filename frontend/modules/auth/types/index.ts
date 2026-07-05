
// frontend/modules/auth/types/index.ts

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  tenantId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}

export interface LoginResult {
  mfaRequired?: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  sessionId?: string;
}

export interface MfaStatus {
  enabled: boolean;
  remainingBackupCodes: number;
}

export interface MfaEnrollStart {
  otpauthUri: string;
  secret: string;
  issuer: string;
}

export interface SessionListItem {
  _id: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  issuedAt: string;
  lastActiveAt: string;
  expiresAt: string;
  status: 'active' | 'revoked' | 'expired';
  isCurrent: boolean;
}

export interface SsoDiscoveryResult {
  ssoAvailable: boolean;
  connectionId?: string;
  displayName?: string;
}

export type AuthApiError = {
  error: string;
  code?: string;
};


