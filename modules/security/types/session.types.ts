// modules/security/types/session.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type SessionStatus = 'active' | 'revoked' | 'expired';

export interface UserSession extends BaseEntity {
  userId: string;
  sessionId: string;
  status: SessionStatus;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  issuedAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedBy?: string;
  revokedReason?: string;
}

export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  expiresAt: Date;
}

export interface SessionListItem {
  _id: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  issuedAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  status: SessionStatus;
  isCurrent: boolean;
}