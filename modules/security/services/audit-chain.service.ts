// modules/security/services/audit-chain.service.ts

import crypto from 'crypto';
import { auditLogRepository, AuditLogRepository } from '../repositories/audit-log.repository';
import {
  AuditLogEntry,
  AuditCategory,
  AuditSeverity,
  ChainVerificationResult,
} from '../types/audit-log.types';

const GENESIS_HASH = '0'.repeat(64);

/**
 * Serializes concurrent `append` calls within this Node process so that
 * "read the last hash, compute the next one, write it" is effectively
 * atomic without requiring a distributed lock or Mongo transaction.
 * This is correct for the app's current single-process deployment model
 * (same assumption CommandBus/QueryBus/RuleActionRegistry already make
 * via their globalThis-cached singletons). A future horizontally-scaled
 * deployment would need to replace this with either a Mongo transaction
 * keyed off a monotonic counter document, or route all appends through
 * a single writer/queue.
 */
class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _auditChainMutex: AsyncMutex | undefined;
}
const mutex: AsyncMutex = global._auditChainMutex ?? (global._auditChainMutex = new AsyncMutex());

/** Deep, key-sorted canonicalization so the same logical entry always hashes identically. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export interface AppendAuditEntryInput {
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
}

type HashableFields = Omit<AuditLogEntry, '_id' | 'hash' | 'createdAt'>;

export class AuditChainService {
  constructor(private readonly repo: AuditLogRepository = auditLogRepository) {}

  private computeHash(entry: HashableFields): string {
    const canonical = canonicalStringify({
      sequence: entry.sequence,
      prevHash: entry.prevHash,
      action: entry.action,
      category: entry.category,
      severity: entry.severity,
      userId: entry.userId,
      tenantId: entry.tenantId,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
      changes: entry.changes ?? null,
      eventId: entry.eventId ?? null,
      recordedAt: entry.recordedAt,
    });
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  async append(input: AppendAuditEntryInput): Promise<AuditLogEntry> {
    return mutex.run(async () => {
      const last = await this.repo.getLastEntry();
      const sequence = (last?.sequence ?? 0) + 1;
      const prevHash = last?.hash ?? GENESIS_HASH;
      const recordedAt = new Date();

      const draft: HashableFields = {
        sequence,
        prevHash,
        action: input.action,
        category: input.category,
        severity: input.severity,
        userId: input.userId,
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
        changes: input.changes,
        eventId: input.eventId,
        recordedAt,
      };

      const hash = this.computeHash(draft);
      return this.repo.append({ ...draft, hash });
    });
  }

  /**
   * Walks the chain from `fromSequence` (default: the very first entry)
   * to the end, recomputing each entry's hash and confirming its
   * `prevHash` matches the preceding entry's stored hash. Returns the
   * first point of divergence, if any — either fact (a tampered field
   * that no longer hashes to the stored value, or a stored hash that no
   * longer matches what the next entry claims as its predecessor) is
   * sufficient evidence the ledger was altered outside this service.
   */
  async verifyIntegrity(fromSequence: number = 1): Promise<ChainVerificationResult> {
    const entries = await this.repo.getAllFromSequence(fromSequence);

    let expectedPrevHash =
      fromSequence > 1
        ? (await this.repo.getBySequence(fromSequence - 1))?.hash ?? GENESIS_HASH
        : GENESIS_HASH;

    for (const entry of entries) {
      if (entry.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAtSequence: entry.sequence,
          reason: 'prevHash does not match the preceding entry\'s stored hash',
          checkedEntries: entries.length,
          verifiedAt: new Date(),
        };
      }

      const recomputed = this.computeHash(entry);
      if (recomputed !== entry.hash) {
        return {
          valid: false,
          brokenAtSequence: entry.sequence,
          reason: 'stored hash does not match the recomputed hash (entry contents were altered)',
          checkedEntries: entries.length,
          verifiedAt: new Date(),
        };
      }

      expectedPrevHash = entry.hash;
    }

    return { valid: true, checkedEntries: entries.length, verifiedAt: new Date() };
  }
}

export const auditChainService = new AuditChainService();