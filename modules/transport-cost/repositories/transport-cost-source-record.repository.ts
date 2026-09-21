// modules/transport-cost/repositories/transport-cost-source-record.repository.ts
//
// Extends TenantScopedRepository (not plain BaseRepository) so every
// read goes through the same org-unit-scoping helpers as
// vehicles/fuel/expenses/trips -- see server/tenancy/module-scope.registry.ts
// for this module's registered entry and rationale, and
// tests/security/module-scope-conformance.spec.ts for the invariant this
// satisfies (a 'org-unit' module must declare orgUnitId on its entity
// AND have a repository that is demonstrably wired for it).

import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TransportCostSourceRecord, TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { Filter } from 'mongodb';

export class TransportCostSourceRecordRepository extends TenantScopedRepository<TransportCostSourceRecord> {
  protected collectionName = 'tbltransportcostsourcerecords';

  /**
   * Duplicate-record check at import time (audit Section I): same sheet
   * family, registration, calendar date, and amount within this tenant.
   * Deliberately NOT scoped by org unit here -- a re-imported file
   * should be recognised as a duplicate regardless of which org unit
   * the importer is currently acting under, the same reasoning
   * ImportTripsHandler uses for its own duplicate check.
   *
   * This is a SOFT match on purpose (see the handler): it flags, it
   * does not silently merge or silently drop. Two rows that
   * legitimately differ only in a field not checked here (e.g. two
   * separate deliveries to the same destination on the same day for
   * the same amount) will still be flagged for a human to look at,
   * which is the safer failure mode per the audit's data-truth rule.
   */
  async findLikelyDuplicate(
    sheetFamily: TransportCostSheetFamily,
    registration: string | null,
    date: Date | null,
    amount: number | null,
    tenantId: string
  ): Promise<TransportCostSourceRecord | null> {
    // Without both a registration and a date, this check cannot mean
    // anything -- fall through and let the row import; a later
    // normalization phase (Section K) is where identity resolution for
    // registration-less rows (e.g. a Vansales row missing its REG cell)
    // gets handled deliberately, not accidentally here.
    if (!registration || !date) return null;

    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    return this.findOne(
      {
        sheetFamily,
        registration,
        date: { $gte: dayStart, $lt: dayEnd },
        amount,
      } as Filter<TransportCostSourceRecord>,
      tenantId
    );
  }

  async findByImportBatch(
    importBatchId: string,
    tenantId: string,
    context: TenantContext
  ): Promise<TransportCostSourceRecord[]> {
    return this.findManyInScope({ importBatchId } as Filter<TransportCostSourceRecord>, context, {
      sortBy: 'sourceRowNumber',
      sortOrder: 'asc',
    });
  }

  async findInScope(
    filter: Filter<TransportCostSourceRecord>,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<TransportCostSourceRecord>> {
    return this.findWithPaginationInScope(filter, pagination, context);
  }

  async countByImportBatch(importBatchId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    return collection.countDocuments({
      importBatchId,
      tenantId,
      isDeleted: { $ne: true },
    } as Filter<TransportCostSourceRecord>);
  }
}

export const transportCostSourceRecordRepository = new TransportCostSourceRecordRepository();
