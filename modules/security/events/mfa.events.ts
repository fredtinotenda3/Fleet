// modules/security/events/mfa.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';

export const MFA_ENROLLED = 'MfaEnrolled';
export const MFA_DISABLED = 'MfaDisabled';
export const MFA_BACKUP_CODE_USED = 'MfaBackupCodeUsed';

export class MfaEnrolledEvent extends DomainEvent {
  constructor(userId: string, tenantId: string) {
    super(MFA_ENROLLED, { entityType: 'mfa_factor', entityId: userId, tenantId }, { tenantId, userId });
  }
}

export class MfaDisabledEvent extends DomainEvent {
  constructor(userId: string, tenantId: string) {
    super(MFA_DISABLED, { entityType: 'mfa_factor', entityId: userId, tenantId }, { tenantId, userId });
  }
}

export class MfaBackupCodeUsedEvent extends DomainEvent {
  constructor(userId: string, tenantId: string) {
    super(MFA_BACKUP_CODE_USED, { entityType: 'mfa_backup_code', entityId: userId, tenantId }, { tenantId, userId });
  }
}