// modules/attention/repositories/value-ledger.repository.ts

import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { ValueLedgerEntry } from '../types/value-ledger.types';
import { ConflictError } from '@/server/errors/app.errors';

/**
 * APPEND-ONLY, BY CONSTRUCTION NOT JUST BY CONVENTION.
 *
 * BaseRepository gives every repository a working update()/softDelete()/
 * hardDelete(). Those are exactly the three operations a value ledger
 * must never expose -- a posting that can be quietly edited or removed
 * after the fact is not evidence. Overriding them here to throw means a
 * future call site that reaches for `valueLedgerRepository.update(...)`
 * (an easy, unremarkable-looking mistake -- every other repository in
 * this codebase has that method) fails loudly at the call, not
 * silently in production. The only way to add data to this collection
 * is append().
 */
export class ValueLedgerRepository extends TenantScopedRepository<ValueLedgerEntry> {
  protected collectionName = 'tblvalueledger';

  /** The sole write path. One insert, no upsert, no update. */
  async append(
    data: Omit<
      ValueLedgerEntry,
      '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
    >,
    tenantId: string,
    userId?: string
  ): Promise<ValueLedgerEntry> {
    return this.create(data, tenantId, userId);
  }

  /** All postings evidencing one attention item, most recent first. Scoped read for the (not-yet-built) ledger export. */
  async findByAttentionItemKeyInScope(
    tenantId: string,
    attentionItemKey: string
  ): Promise<ValueLedgerEntry[]> {
    return this.findMany(
      { attentionItemKey } as any,
      tenantId,
      { sortBy: 'resolvedAt', sortOrder: 'desc' }
    );
  }

  async update(): Promise<ValueLedgerEntry | null> {
    throw new ConflictError('value_ledger is append-only: entries cannot be updated once written.');
  }

  async softDelete(): Promise<boolean> {
    throw new ConflictError('value_ledger is append-only: entries cannot be deleted.');
  }

  async hardDelete(): Promise<boolean> {
    throw new ConflictError('value_ledger is append-only: entries cannot be deleted.');
  }
}

export const valueLedgerRepository = new ValueLedgerRepository();