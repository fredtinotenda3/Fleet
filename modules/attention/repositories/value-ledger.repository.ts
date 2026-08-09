// modules/attention/repositories/value-ledger.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { ValueLedgerEntry } from '../types/value-ledger.types';
import type { LedgerExportFilters } from '../types/ledger-export.types';
import { ConflictError } from '@/server/errors/app.errors';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

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

  /**
   * Scoped, capped, row-level read for the value-ledger export (Step 3
   * -- see modules/attention/services/ledger-export.service.ts). Not
   * an override of anything from Step 2: append-only immutability is
   * about WRITE paths, this is a read, and the export needs more than
   * findByAttentionItemKeyInScope() gives it -- every posting across
   * every item the caller can see, optionally filtered by date range
   * and source.
   *
   * Composes the same two scope layers every other export in this
   * codebase does (see ExpenseRepository.buildScopedMatch): tenant
   * scope via getActiveFilter(), then org-unit scope via
   * tenantScopeService.buildFilter(). Capped via EXPORT_ROW_CAP for
   * the same reason documented there -- an unbounded query from a
   * synchronous HTTP request is a DoS risk independent of tenancy.
   * `totalMatched` lets the caller tell a truncated export from a
   * complete one without a second round trip.
   */
  async getFilteredEntriesForExport(
    filters: LedgerExportFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<ValueLedgerEntry>> {
    const collection = await this.getCollection();

    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<ValueLedgerEntry>(context, 'orgUnitId'),
    };

    if (filters.source) {
      match.source = filters.source;
    }
    if (filters.from || filters.to) {
      const resolvedAtFilter: Record<string, Date> = {};
      if (filters.from) resolvedAtFilter.$gte = filters.from;
      if (filters.to) resolvedAtFilter.$lte = filters.to;
      match.resolvedAt = resolvedAtFilter;
    }

    const finalFilter = match as Filter<ValueLedgerEntry>;

    const [rows, totalMatched] = await Promise.all([
      collection.find(finalFilter).sort({ resolvedAt: -1 }).limit(cap).toArray(),
      collection.countDocuments(finalFilter),
    ]);

    const normalizedRows = this.normalizeDocs<ValueLedgerEntry>(rows);

    return {
      rows: normalizedRows,
      totalMatched,
      truncated: totalMatched > normalizedRows.length,
      exportCap: cap,
    };
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