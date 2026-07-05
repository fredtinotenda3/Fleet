// server/events/handlers/security/SecurityAuditHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import {
  SECURITY_LOGIN_SUCCESS,
  SECURITY_LOGIN_FAILED,
  SECURITY_BRUTE_FORCE_DETECTED,
  SECURITY_ACCOUNT_LOCKED,
  SECURITY_ACCOUNT_UNLOCKED,
  SECURITY_RATE_LIMIT_ANOMALY,
  AUDIT_CHAIN_INTEGRITY_FAILURE,
} from '../../event-names';

/**
 * Bridges the Slice 6c threat-detection events onto the audit ledger
 * (via auditLog, which now persists to the hash chain) and, for the
 * highest-severity signals, onto the existing notification system so an
 * organization owner actually sees them rather than the event only
 * living in a log collection nobody is watching.
 */
export class SecurityAuditHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    const tenantId = (event.metadata?.tenantId as string) || (payload.tenantId as string) || 'default';
    const userId = (event.metadata?.userId as string) || (payload.email as string) || 'system';

    const { severity, entityType } = this.classify(event.eventName);

    await auditLog.log({
      action: `SECURITY_${event.eventName}`,
      userId,
      tenantId,
      entityType,
      category: 'security',
      severity,
      ipAddress: payload.ipAddress as string | undefined,
      metadata: { eventId: event.eventId, occurredOn: event.occurredOn, payload },
    });

    if (severity === 'critical') {
      await this.notifyOwners(event, tenantId).catch(() => undefined);
    }
  }

  private classify(eventName: string): { severity: 'info' | 'warning' | 'critical'; entityType: string } {
    switch (eventName) {
      case SECURITY_LOGIN_SUCCESS:
        return { severity: 'info', entityType: 'auth' };
      case SECURITY_LOGIN_FAILED:
        return { severity: 'warning', entityType: 'auth' };
      case SECURITY_BRUTE_FORCE_DETECTED:
      case SECURITY_ACCOUNT_LOCKED:
      case AUDIT_CHAIN_INTEGRITY_FAILURE:
        return { severity: 'critical', entityType: 'auth' };
      case SECURITY_ACCOUNT_UNLOCKED:
        return { severity: 'info', entityType: 'auth' };
      case SECURITY_RATE_LIMIT_ANOMALY:
        return { severity: 'critical', entityType: 'rate_limit' };
      default:
        return { severity: 'info', entityType: 'security' };
    }
  }

  private async notifyOwners(event: DomainEvent, tenantId: string): Promise<void> {
    if (tenantId === 'default' || tenantId === 'system') return;

    const organization = await organizationRepository.findById(tenantId, tenantId, false, true);
    if (!organization) return;

    const ownerIds = organization.members
      .filter((m) => m.role === 'organization_owner')
      .map((m) => m.userId);

    if (ownerIds.length === 0) return;

    const { title, message } = this.describe(event);

    await notificationService.sendBulkNotification(ownerIds, tenantId, {
      type: 'alert',
      title,
      message,
      priority: 'critical',
      data: { eventName: event.eventName, payload: event.payload },
      actionUrl: '/settings/security',
      actionLabel: 'Review Security Activity',
    });
  }

  private describe(event: DomainEvent): { title: string; message: string } {
    const payload = event.payload;
    switch (event.eventName) {
      case SECURITY_BRUTE_FORCE_DETECTED:
        return {
          title: 'Possible brute-force attempt detected',
          message: `Repeated failed logins detected for ${payload.email} (${payload.failedAttempts} attempts).`,
        };
      case SECURITY_ACCOUNT_LOCKED:
        return {
          title: 'Account locked',
          message: `The account ${payload.email} has been temporarily locked due to repeated failed login attempts.`,
        };
      case SECURITY_RATE_LIMIT_ANOMALY:
        return {
          title: 'Unusual request pattern detected',
          message: `IP address ${payload.ipAddress} has been rate-limited across ${payload.distinctEndpoints} different endpoints in a short window.`,
        };
      case AUDIT_CHAIN_INTEGRITY_FAILURE:
        return {
          title: 'Audit log integrity check failed',
          message: `The audit trail's hash chain is broken starting at entry #${payload.brokenAtSequence}. This may indicate tampering.`,
        };
      default:
        return { title: 'Security event', message: event.eventName };
    }
  }
}