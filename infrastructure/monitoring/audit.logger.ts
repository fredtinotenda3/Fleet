// infrastructure/monitoring/audit.logger.ts

import { monitoring } from './logger';
import { auditChainService } from '@/modules/security/services/audit-chain.service';
import { AuditCategory, AuditSeverity } from '@/modules/security/types/audit-log.types';

export interface AuditEntry {
  action: string;
  userId: string;
  tenantId: string;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  eventId?: string;
}

/**
 * Every call to `log()` (and the logCreate/logUpdate/... convenience
 * wrappers below) both prints a structured console line AND appends an
 * immutable, hash-chained record to the `tblauditlog` collection via
 * AuditChainService. This file is the single choke point through which
 * nearly every write path in the platform already reports its actions
 * (organizations, billing, security, workflows, rules, ...), so
 * upgrading it here gives Slice 6c a tamper-evident audit trail covering
 * the whole application without touching each of those call sites.
 *
 * Persistence failures are swallowed (logged, not thrown) so a hiccup
 * writing to the ledger never fails the business operation that
 * triggered the audit entry — that operation already succeeded by the
 * time `auditLog.log()` is called.
 */
export class AuditLogger {
  async log(entry: AuditEntry): Promise<void> {
    const auditRecord = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    monitoring.logInfo('Audit', auditRecord);

    try {
      await auditChainService.append({
        action: entry.action,
        category: entry.category ?? 'domain',
        severity: entry.severity ?? 'info',
        userId: entry.userId,
        tenantId: entry.tenantId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: entry.metadata,
        changes: entry.changes,
        eventId: entry.eventId,
      });
    } catch (error) {
      monitoring.logError('Failed to append audit entry to hash chain', error as Error, {
        action: entry.action,
        tenantId: entry.tenantId,
      });
    }
  }

  async logAction(
    action: string,
    userId: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({ action, userId, tenantId, entityType: 'system', metadata });
  }

  async logCreate(
    userId: string,
    tenantId: string,
    entityType: string,
    entityId: string,
    data: unknown
  ): Promise<void> {
    await this.log({
      action: 'CREATE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: data as Record<string, unknown>,
    });
  }

  async logUpdate(
    userId: string,
    tenantId: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown
  ): Promise<void> {
    await this.log({
      action: 'UPDATE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: {
        before: before as Record<string, unknown>,
        after: after as Record<string, unknown>,
      },
    });
  }

  async logDelete(
    userId: string,
    tenantId: string,
    entityType: string,
    entityId: string,
    data: unknown
  ): Promise<void> {
    await this.log({
      action: 'DELETE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: data as Record<string, unknown>,
    });
  }

  async logLogin(
    userId: string,
    tenantId: string,
    success: boolean,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      userId,
      tenantId,
      entityType: 'auth',
      category: 'security',
      severity: success ? 'info' : 'warning',
      ipAddress,
      metadata: { ipAddress, success },
    });
  }
}

export const auditLog = new AuditLogger();