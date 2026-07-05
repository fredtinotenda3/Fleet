// modules/security/types/mfa.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type MfaFactorType = 'totp';
export type MfaFactorStatus = 'pending' | 'verified';

export interface MfaFactor extends BaseEntity {
  userId: string;
  type: MfaFactorType;
  /** Envelope-encrypted (EncryptionService) base32 TOTP secret. Never returned to clients. */
  secretEncrypted: string;
  status: MfaFactorStatus;
  label?: string;
  verifiedAt?: Date;
  lastUsedAt?: Date;
}

export interface MfaBackupCode extends BaseEntity {
  userId: string;
  codeHash: string;
  used: boolean;
  usedAt?: Date;
}

export interface MfaEnrollStartResult {
  otpauthUri: string;
  secret: string;
  issuer: string;
}

export interface MfaEnrollVerifyResult {
  backupCodes: string[];
}

export type MfaVerifyReason = 'totp' | 'backup_code';