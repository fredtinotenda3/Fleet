// modules/security/services/mfa.service.ts

import {
  mfaFactorRepository,
  mfaBackupCodeRepository,
  MfaFactorRepository,
  MfaBackupCodeRepository,
} from '../repositories/mfa.repository';
import { encryptionService, EncryptionService } from '@/infrastructure/secrets/encryption.service';
import {
  generateBase32Secret,
  buildOtpauthUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
} from '../utils/totp.util';
import { MfaEnrollStartResult, MfaEnrollVerifyResult, MfaVerifyReason } from '../types/mfa.types';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { MfaEnrolledEvent, MfaDisabledEvent, MfaBackupCodeUsedEvent } from '../events/mfa.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

const ISSUER_NAME = process.env.MFA_ISSUER_NAME || 'Fleet Platform';
const BACKUP_CODE_COUNT = 10;
const MIN_LOW_BACKUP_CODES = 3;

export class MfaService {
  constructor(
    private readonly factorRepo: MfaFactorRepository = mfaFactorRepository,
    private readonly backupRepo: MfaBackupCodeRepository = mfaBackupCodeRepository,
    private readonly encryption: EncryptionService = encryptionService
  ) {}

  async isEnabled(userId: string, tenantId: string): Promise<boolean> {
    const factor = await this.factorRepo.findVerifiedByUser(userId, tenantId);
    return factor !== null;
  }

  /**
   * Starts (or restarts) TOTP enrollment: generates a fresh secret,
   * stores it encrypted in `pending` status, and returns the plaintext
   * secret / otpauth URI exactly once for the client to render as a QR
   * code. Restarting enrollment discards any previous pending secret so
   * a user can retry a failed scan without leaking stale secrets.
   */
  async enrollStart(userId: string, tenantId: string, accountLabel: string): Promise<MfaEnrollStartResult> {
    const existingVerified = await this.factorRepo.findVerifiedByUser(userId, tenantId);
    if (existingVerified) {
      throw new ConflictError('MFA is already enabled for this account. Disable it before re-enrolling.');
    }

    const existingPending = await this.factorRepo.findPendingByUser(userId, tenantId);
    if (existingPending) {
      await this.factorRepo.hardDelete(existingPending._id!, tenantId, true);
    }

    const secret = generateBase32Secret();
    await this.factorRepo.create(
      {
        tenantId,
        userId,
        type: 'totp',
        secretEncrypted: this.encryption.encrypt(secret),
        status: 'pending',
        label: accountLabel,
      },
      tenantId,
      userId
    );

    return {
      otpauthUri: buildOtpauthUri({ secret, accountName: accountLabel, issuer: ISSUER_NAME }),
      secret,
      issuer: ISSUER_NAME,
    };
  }

  /**
   * Completes enrollment: verifies the submitted code against the
   * pending secret, promotes it to `verified`, and generates a fresh
   * set of backup codes (returned in plaintext exactly once — only
   * their SHA-256 hashes are persisted).
   */
  async enrollVerify(userId: string, tenantId: string, code: string): Promise<MfaEnrollVerifyResult> {
    const pending = await this.factorRepo.findPendingByUser(userId, tenantId);
    if (!pending) {
      throw new NotFoundError('No pending MFA enrollment found. Start enrollment first.');
    }

    const secret = this.encryption.decrypt(pending.secretEncrypted);
    if (!verifyTotp(secret, code)) {
      throw new ValidationError('Invalid verification code');
    }

    await this.factorRepo.markVerified(pending._id!, tenantId);

    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    await this.backupRepo.replaceAllForUser(userId, tenantId, backupCodes.map(hashBackupCode));

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new MfaEnrolledEvent(userId, tenantId));

    await auditLog.log({
      action: 'MFA_ENROLLED',
      userId,
      tenantId,
      entityType: 'mfa_factor',
      entityId: pending._id,
      category: 'security',
      severity: 'info',
    });

    return { backupCodes };
  }

  /**
   * Verifies a login-time or step-up code against either the user's
   * TOTP secret or an unused backup code. Backup codes are single-use
   * and consumed atomically on success.
   */
  async verifyCode(
    userId: string,
    tenantId: string,
    code?: string | null,
    backupCode?: string | null
  ): Promise<{ valid: boolean; reason?: MfaVerifyReason }> {
    const factor = await this.factorRepo.findVerifiedByUser(userId, tenantId);
    if (!factor) {
      return { valid: false };
    }

    if (code) {
      const secret = this.encryption.decrypt(factor.secretEncrypted);
      if (verifyTotp(secret, code)) {
        await this.factorRepo.touchLastUsed(factor._id!, tenantId);
        return { valid: true, reason: 'totp' };
      }
    }

    if (backupCode) {
      const unused = await this.backupRepo.findUnusedByUser(userId);
      const candidateHash = hashBackupCode(backupCode);
      const match = unused.find((entry) => entry.codeHash === candidateHash);
      if (match) {
        await this.backupRepo.consume(match._id!);

        const eventBus = EventBusFactory.getInstance();
        await eventBus.publish(new MfaBackupCodeUsedEvent(userId, tenantId));

        const remaining = await this.backupRepo.countUnusedByUser(userId);
        if (remaining <= MIN_LOW_BACKUP_CODES) {
          await auditLog.log({
            action: 'MFA_BACKUP_CODES_LOW',
            userId,
            tenantId,
            category: 'security',
            severity: 'warning',
            metadata: { remaining },
          });
        }

        return { valid: true, reason: 'backup_code' };
      }
    }

    return { valid: false };
  }

  async disable(userId: string, tenantId: string, code?: string | null, backupCode?: string | null): Promise<void> {
    const factor = await this.factorRepo.findVerifiedByUser(userId, tenantId);
    if (!factor) {
      throw new NotFoundError('MFA is not enabled for this account');
    }

    const { valid } = await this.verifyCode(userId, tenantId, code, backupCode);
    if (!valid) {
      throw new AppError('A valid authentication code is required to disable MFA', 'INVALID_MFA_CODE', 400);
    }

    await this.factorRepo.deleteAllForUser(userId, tenantId);
    await this.backupRepo.deleteAllForUser(userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new MfaDisabledEvent(userId, tenantId));

    await auditLog.log({
      action: 'MFA_DISABLED',
      userId,
      tenantId,
      category: 'security',
      severity: 'warning',
    });
  }

  async regenerateBackupCodes(
    userId: string,
    tenantId: string,
    code?: string | null,
    backupCode?: string | null
  ): Promise<string[]> {
    const factor = await this.factorRepo.findVerifiedByUser(userId, tenantId);
    if (!factor) {
      throw new NotFoundError('MFA is not enabled for this account');
    }

    const { valid } = await this.verifyCode(userId, tenantId, code, backupCode);
    if (!valid) {
      throw new AppError(
        'A valid authentication code is required to regenerate backup codes',
        'INVALID_MFA_CODE',
        400
      );
    }

    const codes = generateBackupCodes(BACKUP_CODE_COUNT);
    await this.backupRepo.replaceAllForUser(userId, tenantId, codes.map(hashBackupCode));

    await auditLog.log({
      action: 'MFA_BACKUP_CODES_REGENERATED',
      userId,
      tenantId,
      category: 'security',
      severity: 'info',
    });

    return codes;
  }

  async remainingBackupCodes(userId: string): Promise<number> {
    return this.backupRepo.countUnusedByUser(userId);
  }
}

export const mfaService = new MfaService();