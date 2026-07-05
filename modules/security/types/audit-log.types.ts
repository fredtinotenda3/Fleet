// modules/security/types/audit-log.types.ts

export type AuditCategory = 'domain' | 'security' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

/**
 * A single, immutable entry in the append-only audit ledger. Each entry
 * cryptographically commits to the entry before it via `prevHash`, so any
 * retroactive edit or deletion of a past entry breaks the chain from that
 * point forward — detectable by AuditChainService.verifyIntegrity().
 */
export interface AuditLogEntry {
  _id?: string;
  sequence: number;
  prevHash: string;
  hash: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  userId: string;
  tenantId: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  eventId?: string;
  recordedAt: Date;
  createdAt?: Date;
}

export interface AuditLogFilters {
  tenantId?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAtSequence?: number;
  reason?: string;
  checkedEntries: number;
  verifiedAt: Date;
}