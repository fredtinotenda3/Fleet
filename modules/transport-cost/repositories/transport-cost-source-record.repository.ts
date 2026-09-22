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
import { Filter, ObjectId } from 'mongodb';
import { parsePeriodMonth } from '../utils/normalization.utils';

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

  /**
   * ADDED, item 6 (data-quality exceptions export). Bulk id lookup --
   * used by TransportCostReportService.getDataQualityExceptions to
   * resolve a posting's sourceId back to the source record it came
   * from, without one findById round trip per posting. Same
   * validate-then-toObjectId pattern as bulkSetField below.
   */
  async findManyByIds(ids: string[], context: TenantContext): Promise<TransportCostSourceRecord[]> {
    const validIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => this.toObjectId(id));
    if (validIds.length === 0) return [];
    const filter: Record<string, unknown> = { _id: { $in: validIds } };
    return this.findManyInScope(filter as Filter<TransportCostSourceRecord>, context, {
      limit: 100000,
    });
  }

  /**
   * ADDED, item 6 (data-quality exceptions export). Batched sibling of
   * findByImportBatch above -- the exceptions report needs source
   * records for a SET of batches (every batch that touched the
   * requested period), not one batch at a time.
   */
  async findByImportBatchIds(
    importBatchIds: string[],
    context: TenantContext
  ): Promise<TransportCostSourceRecord[]> {
    if (importBatchIds.length === 0) return [];
    return this.findManyInScope(
      { importBatchId: { $in: importBatchIds } } as Filter<TransportCostSourceRecord>,
      context,
      { sortBy: 'sourceRowNumber', sortOrder: 'asc', limit: 100000 }
    );
  }

  async findInScope(
    filter: Filter<TransportCostSourceRecord>,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<TransportCostSourceRecord>> {
    return this.findWithPaginationInScope(filter, pagination, context);
  }

  /**
   * ADDED, Phase O4. Rows in a period with no Amount recorded yet --
   * what drives the report screen's "this total includes pending rows,
   * do not present it as final" banner. Deliberately scoped to the
   * CALLER's org-unit visibility (findManyInScope), not a raw count:
   * the banner must reflect what pending evidence the viewer themselves
   * can see, the same scoping discipline as every other report path in
   * this codebase.
   *
   * WIDENED, Command Centre Slice A0. Originally hardcoded to
   * `sheetFamily: 'third-party'` -- the only family the O4 report
   * screen read. Now accepts any family or set of families so the
   * Command Centre's cross-family missing-cost breakdown (Slice C) can
   * ask the same "how much pending evidence exists" question for
   * Vansales/Swift/Depot STO too, not just 3rd Party. Defaults to
   * `'third-party'` so every pre-existing caller (the O4 report screen)
   * is unaffected.
   *
   * VANSALES IS HANDLED SEPARATELY, ON PURPOSE. Every other family
   * carries a real per-row `date` this method can range-filter directly
   * in the query. Vansales carries no per-row date at all -- only a
   * declared `vansales.periodMonth` ("YYYY-MM", see
   * VansalesSourceFields's own doc comment) -- so a dotted-path Mongo
   * filter (`'vansales.periodMonth': {...}`) would be needed to push
   * that check into the query. tests/helpers/fake-collection.ts's
   * matcher reads `doc[field]` as a LITERAL key, not a dotted path (real
   * MongoDB supports dot-path filters; this fake deliberately does not
   * -- see its own header), so a dotted filter here would silently
   * match nothing under the shared test double while working against
   * real Mongo -- exactly the kind of trap this codebase's own test
   * discipline exists to catch. Instead: fetch every amount-null
   * Vansales row once (bounded, org-unit scoped, same as every other
   * branch here) and check each row's own declared period in Node via
   * the same `parsePeriodMonth` helper TransportCostPostingService
   * already uses at posting time, against the SAME fully-contained rule
   * the ledger uses everywhere else (see allocation-ledger.repository.ts's
   * `buildPeriodFilter` doc comment) -- one bounded fetch, not a second
   * database round trip per row.
   */
  async countPendingAmount(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext,
    sheetFamily: TransportCostSheetFamily | TransportCostSheetFamily[] = 'third-party'
  ): Promise<number> {
    const families = Array.isArray(sheetFamily) ? sheetFamily : [sheetFamily];
    const datedFamilies = families.filter((f) => f !== 'vansales');
    let count = 0;

    if (datedFamilies.length > 0) {
      const rows = await this.findManyInScope(
        {
          sheetFamily: datedFamilies.length === 1 ? datedFamilies[0] : { $in: datedFamilies },
          amount: null,
          date: { $gte: periodStart, $lte: periodEnd },
        } as Filter<TransportCostSourceRecord>,
        context,
        { limit: 100000 }
      );
      count += rows.length;
    }

    if (families.includes('vansales')) {
      const vansalesRows = await this.findManyInScope(
        { sheetFamily: 'vansales', amount: null } as Filter<TransportCostSourceRecord>,
        context,
        { limit: 100000 }
      );
      count += vansalesRows.filter((row) => {
        const period = parsePeriodMonth(row.vansales?.periodMonth ?? null);
        if (!period) return false;
        return period.periodStart >= periodStart && period.periodEnd <= periodEnd;
      }).length;
    }

    return count;
  }

  async countByImportBatch(importBatchId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    return collection.countDocuments({
      importBatchId,
      tenantId,
      isDeleted: { $ne: true },
    } as Filter<TransportCostSourceRecord>);
  }

  /**
   * Phase O2: fans a confirmed review decision out to every source
   * record that was waiting on it. Called ONLY from
   * confirm-review-match.handler.ts / confirm-review-new.handler.ts --
   * see normalization-review.types.ts's central rule. `sourceRecordIds`
   * comes from a NormalizationReviewItem, never from user input
   * directly, so no additional validation of the ids' provenance is
   * done here beyond tenant scoping.
   */
  async bulkSetTransporterPartner(
    sourceRecordIds: string[],
    transporterPartnerId: string,
    tenantId: string
  ): Promise<number> {
    return this.bulkSetField(sourceRecordIds, 'transporterPartnerId', transporterPartnerId, tenantId);
  }

  async bulkSetContractedVehicle(
    sourceRecordIds: string[],
    contractedVehicleId: string,
    tenantId: string
  ): Promise<number> {
    return this.bulkSetField(sourceRecordIds, 'contractedVehicleId', contractedVehicleId, tenantId);
  }

  private async bulkSetField(
    sourceRecordIds: string[],
    field: 'transporterPartnerId' | 'contractedVehicleId',
    value: string,
    tenantId: string
  ): Promise<number> {
    const validIds = sourceRecordIds.filter((id) => ObjectId.isValid(id)).map((id) => this.toObjectId(id));
    if (validIds.length === 0) return 0;

    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      ...this.getTenantFilter(tenantId),
      _id: { $in: validIds },
    };
    const result = await collection.updateMany(filter as Filter<TransportCostSourceRecord>, {
      $set: { [field]: value, updatedAt: new Date() },
    } as any);
    return result.modifiedCount;
  }
}

export const transportCostSourceRecordRepository = new TransportCostSourceRecordRepository();
