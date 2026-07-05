// modules/security/types/refresh-token.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type RefreshTokenStatus = 'active' | 'rotated' | 'revoked' | 'reused';

export interface RefreshToken extends BaseEntity {
  userId: string;
  familyId: string;
  tokenHash: string;
  sessionId: string;
  status: RefreshTokenStatus;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  revokedReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}