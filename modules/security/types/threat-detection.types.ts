// modules/security/types/threat-detection.types.ts

export interface LoginAttemptRecord {
  _id?: string;
  email: string;
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  attemptedAt: Date;
}

export interface AccountLockout {
  _id?: string;
  email: string;
  tenantId: string;
  failedCount: number;
  lockedUntil?: Date | null;
  lastFailedAt?: Date;
  updatedAt?: Date;
}

export interface RecordLoginAttemptInput {
  email: string;
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}

export interface LoginAttemptResult {
  locked: boolean;
  lockedUntil?: Date;
  bruteForceDetected: boolean;
  failedCount: number;
}