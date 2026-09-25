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
import { Filter, ObjectId, UpdateFilter } from 'mongodb';
import { parsePeriodMonth } from '../utils/normalization.utils';

/**
 * ADDED, Command Centre Slice A/C. Whether `field` ('destinationTown' or
 * 'customerName') matches `needle` on a source record -- checking the
 * record's own flat field OR any of its `lines[]`, never just one.
 *
 * This is the FILTER semantics decision documented at length in
 * TransportCostReportService.getCommandCentreSummary's header: a filter
 * uses OR-over-lines (broad recall -- an operation is included if ANY
 * load on it names this customer/destination), which is safe precisely
 * because filtering only narrows which already-one-posting-per-record
 * rows are considered; it can never cause one record's single ledger
 * posting to be counted twice. Case-insensitive, trimmed -- these values
 * come from the master-data search/select controls (Slice 3), not
 * free-text, but the underlying stored strings still vary in casing
 * across sheet families and manual entries.
 *
 * `needle` undefined/empty means "no filter" -- always matches.
 */
function matchesDestinationOrCustomer(
  row: TransportCostSourceRecord,
  destinationTown?: string,
  customerName?: string
): boolean {
  const matchesField = (needle: string | undefined, flatValue: string | undefined, lineValues: Array<string | undefined>) => {
    if (!needle || !needle.trim()) return true;
    const target = needle.trim().toLowerCase();
    if (flatValue && flatValue.trim().toLowerCase() === target) return true;
    return lineValues.some((v) => !!v && v.trim().toLowerCase() === target);
  };

  return (
    matchesField(destinationTown, row.destinationTown, (row.lines ?? []).map((l) => l.destinationTown)) &&
    matchesField(customerName, row.customerName, (row.lines ?? []).map((l) => l.customerName))
  );
}

/**
 * Whether `field` ('destinationTown' | 'customerName') has a real value
 * ANYWHERE on this record -- its own flat field or any line -- used by
 * getDataQualityBreakdown to decide "missing" (see that method's header
 * for why this is deliberately permissive: a value present on even one
 * line means the operation is not missing this dimension, even though a
 * DIFFERENT line lacks it -- that per-line gap is a finer-grained fact
 * this rollup does not attempt to surface).
 */
function hasAnyLineValue(row: TransportCostSourceRecord, field: 'destinationTown' | 'customerName'): boolean {
  if (row[field]) return true;
  return (row.lines ?? []).some((l) => !!l[field]);
}

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

  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7's reporting
   * requirement: "Where line-level analysis is useful, provide it
   * separately from parent transport-operation metrics... TRANSPORT
   * OPERATIONS vs TRANSPORT LINES/LOADS"). Counts, over a period and
   * within the caller's org-unit scope:
   *
   *   - totalOperations: how many TransportCostSourceRecord rows exist
   *     (each one a single transport OPERATION, regardless of how many
   *     loads it carries).
   *   - totalLines: the sum of every operation's `lines.length` -- a
   *     legacy row with no `lines` field at all (imported before Slice 2)
   *     counts as exactly 1, the same as a Slice-2 row with one line,
   *     since both represent one load either way.
   *   - multiLineOperationCount: how many of those operations have 2+
   *     lines -- the client's own explicit "make it obvious these are
   *     multiple loads belonging to ONE operation" signal, aggregated.
   *
   * Deliberately a SOURCE-RECORD read, not a ledger read -- like
   * countPendingAmount immediately above, this is an operational/
   * statistical view ("how many loads did we handle"), not a financial
   * one, so it does not need to join through AllocationPosting the way
   * a money figure would. Scoped by sheetFamily (default 'third-party',
   * the only family that can currently have more than one line -- see
   * TransportCostLine's own doc comment) so a future caller can widen it
   * without a signature change, mirroring countPendingAmount's own
   * default-parameter convention.
   *
   * Bounded fetch (same `limit: 100000` convention as every other
   * whole-scan read in this repository) rather than an aggregation
   * pipeline: `lines` is an array field, and computing "sum of array
   * lengths" / "count where array length > 1" in application code is
   * both simpler and testable against tests/helpers/fake-collection.ts's
   * minimal aggregate (which has no `$size` operator), the same
   * reasoning getDistinctPostedMonths documents on the ledger repository.
   */
  /**
   * WIDENED, Command Centre Slice A. `filters` narrows the same bounded
   * fetch by the Command Centre's own active filter set BEFORE counting
   * -- so "operations/loads" honours company/vehicle/transporter/
   * destination/customer exactly like the financial cards next to it
   * (the milestone's own "filters must apply consistently to every
   * affected card, chart, table" rule). costFacingCompany/
   * contractedVehicleIds are pushed into the Mongo filter (cheap,
   * indexed-equality/$in fields); destinationTown/customerName cannot be
   * (they must match EITHER the record's own flat field OR any one of
   * its `lines[]` -- see matchesDestinationOrCustomer below), so those
   * two stay a Node-side predicate over the already-bounded fetch, the
   * same "push down what Mongo can do, reduce in Node what it can't"
   * split this repository already uses for Vansales in
   * countPendingAmount.
   */
  async getLoadSummaryInScope(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext,
    sheetFamily: TransportCostSheetFamily | TransportCostSheetFamily[] = 'third-party',
    filters: {
      costFacingCompany?: string;
      contractedVehicleIds?: string[];
      destinationTown?: string;
      customerName?: string;
    } = {}
  ): Promise<{ totalOperations: number; totalLines: number; multiLineOperationCount: number }> {
    if (filters.contractedVehicleIds && filters.contractedVehicleIds.length === 0) {
      return { totalOperations: 0, totalLines: 0, multiLineOperationCount: 0 };
    }

    const families = Array.isArray(sheetFamily) ? sheetFamily : [sheetFamily];
    const rows = await this.findManyInScope(
      {
        sheetFamily: families.length === 1 ? families[0] : { $in: families },
        date: { $gte: periodStart, $lte: periodEnd },
        ...(filters.costFacingCompany ? { costFacingCompany: filters.costFacingCompany } : {}),
        ...(filters.contractedVehicleIds ? { contractedVehicleId: { $in: filters.contractedVehicleIds } } : {}),
      } as Filter<TransportCostSourceRecord>,
      context,
      { limit: 100000 }
    );

    let totalLines = 0;
    let multiLineOperationCount = 0;
    let totalOperations = 0;
    for (const row of rows) {
      if (!matchesDestinationOrCustomer(row, filters.destinationTown, filters.customerName)) continue;
      totalOperations += 1;
      const lineCount = row.lines?.length ?? 1;
      totalLines += lineCount;
      if (lineCount > 1) multiLineOperationCount += 1;
    }

    return { totalOperations, totalLines, multiLineOperationCount };
  }

  /**
   * ADDED, Command Centre Slice C. One bounded fetch + Node reduction
   * (same pattern/limit convention as every other whole-scan read in
   * this file) producing the data-quality trust panel's per-outcome
   * counts for a period and family scope. Every count below is
   * INDEPENDENT and may overlap another -- e.g. a row can be both
   * `missingTonnage` and `unresolvedVehicle` at once -- by design (see
   * OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md Section 8's
   * overlapping-vs-exclusive table): this method never implies mutual
   * exclusivity by only incrementing one bucket per row.
   *
   * "Not applicable" vs "Missing" vs "Unresolved", the client's own
   * required distinction:
   *   - vehicle identity: Swift structurally carries no registration
   *     column at all (see TransportCostSheetFamily's header) -- a
   *     Swift row with no registration is `vehicleNotApplicable`, never
   *     `unresolvedVehicle`. Every other family DOES have a
   *     registration concept; a null registration there is
   *     `missingRegistration` (the source cell itself was blank -- nothing
   *     to resolve yet), while a populated registration with no
   *     contractedVehicleId is `unresolvedVehicle` (O2 review has not
   *     yet confirmed an identity for it).
   *   - destination: Vansales structurally has no per-row destination
   *     (a fixed retainer, not a per-trip delivery -- see
   *     VansalesSourceFields's header) -- every Vansales row is
   *     `destinationNotApplicable`, never `missingDestination`. Every
   *     other family has a real destinationTown concept; a row with
   *     neither a flat destinationTown nor any line destinationTown is
   *     `missingDestination`.
   *   - `missingCostFacingCompany` / `missingCustomer` / `missingTonnage`:
   *     counted wherever the field is structurally meaningful but empty
   *     on this row -- no family currently makes these three
   *     structurally inapplicable, so there is no "not applicable"
   *     variant for them yet.
   */
  async getDataQualityBreakdown(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext,
    sheetFamily: TransportCostSheetFamily[] = ['third-party', 'vansales', 'swift', 'depot-sto']
  ): Promise<{
    totalRows: number;
    missingCostFacingCompany: number;
    missingRegistration: number;
    unresolvedVehicle: number;
    vehicleNotApplicable: number;
    unresolvedTransporter: number;
    missingCustomer: number;
    missingDestination: number;
    destinationNotApplicable: number;
    missingTonnage: number;
  }> {
    const rows = await this.findManyInScope(
      {
        sheetFamily: sheetFamily.length === 1 ? sheetFamily[0] : { $in: sheetFamily },
        date: { $gte: periodStart, $lte: periodEnd },
      } as Filter<TransportCostSourceRecord>,
      context,
      { limit: 100000 }
    );

    const summary = {
      totalRows: rows.length,
      missingCostFacingCompany: 0,
      missingRegistration: 0,
      unresolvedVehicle: 0,
      vehicleNotApplicable: 0,
      unresolvedTransporter: 0,
      missingCustomer: 0,
      missingDestination: 0,
      destinationNotApplicable: 0,
      missingTonnage: 0,
    };

    for (const row of rows) {
      if (!row.costFacingCompany) summary.missingCostFacingCompany += 1;

      if (row.sheetFamily === 'swift' && !row.registration) {
        summary.vehicleNotApplicable += 1;
      } else if (!row.registration) {
        summary.missingRegistration += 1;
      } else if (!row.contractedVehicleId) {
        summary.unresolvedVehicle += 1;
      }

      if (row.transporterRaw && !row.transporterPartnerId) summary.unresolvedTransporter += 1;

      if (row.sheetFamily === 'vansales') {
        summary.destinationNotApplicable += 1;
      } else if (!hasAnyLineValue(row, 'destinationTown')) {
        summary.missingDestination += 1;
      }

      if (!hasAnyLineValue(row, 'customerName')) summary.missingCustomer += 1;

      const hasTonnage = row.tonnageRaw !== null && row.tonnageRaw !== undefined;
      const anyLineTonnage = (row.lines ?? []).some((l) => l.tonnageRaw !== null && l.tonnageRaw !== undefined);
      if (!hasTonnage && !anyLineTonnage) summary.missingTonnage += 1;
    }

    return summary;
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

  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 5. Atomic conditional update --
   * the state-guard-filter idiom this codebase already relies on
   * elsewhere for "no version field exists" concurrency safety (see
   * AllocationLedgerRepository's partial-unique-idempotency-index guard,
   * and TransportCostPostingService's own defensive `findReversalOf`
   * recheck immediately before it writes). `guard` is ANDed onto the
   * normal tenant/org-unit/not-deleted filter atomically inside one
   * findOneAndUpdate -- e.g. `{cancelledAt: {$exists: false}}` for
   * Cancel, so two concurrent cancel requests for the same record can
   * never both "win" (the second sees zero matched documents, not a
   * silently-overwritten first cancellation).
   *
   * Returns `{outcome: 'not-found'}` when the id does not resolve within
   * the caller's scope at all (caller should 404), and
   * `{outcome: 'guard-failed'}` when the record exists but the guard
   * condition no longer holds -- e.g. it was already cancelled, or
   * already posted, by a concurrent request (caller should surface a
   * ConflictError, never silently proceed or silently no-op).
   */
  async conditionalUpdate(
    id: string,
    guard: Filter<TransportCostSourceRecord>,
    data: Partial<Omit<TransportCostSourceRecord, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    context: TenantContext,
    userId: string
  ): Promise<
    | { outcome: 'updated'; record: TransportCostSourceRecord }
    | { outcome: 'not-found' }
    | { outcome: 'guard-failed' }
  > {
    if (!ObjectId.isValid(id)) return { outcome: 'not-found' };

    const existing = await this.findById(id, context.organizationId);
    if (!existing) return { outcome: 'not-found' };
    if (
      context.accessibleOrgUnitIds !== null &&
      (!existing.orgUnitId || !context.accessibleOrgUnitIds.includes(existing.orgUnitId))
    ) {
      // Same 404-not-403 discipline as postSourceRecord/reversePosting:
      // findById is tenant- but not org-unit-scoped, so this is checked
      // by hand, and an out-of-scope id is reported identically to a
      // nonexistent one.
      return { outcome: 'not-found' };
    }

    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(context.organizationId),
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
      ...guard,
    } as Filter<TransportCostSourceRecord>;

    const update: UpdateFilter<TransportCostSourceRecord> = {
      $set: {
        ...data,
        updatedAt: new Date(),
        updatedBy: userId,
      } as any,
    };

    const result = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    if (!result) return { outcome: 'guard-failed' };
    return { outcome: 'updated', record: this.normalizeDoc<TransportCostSourceRecord>(result) };
  }

  /**
   * ADDED, OLIVINE LIVE OPERATING MODEL, SLICE 5. Bulk, tenant-AND-
   * org-unit-scoped fetch by id, for the operational table's per-page
   * status column (see TransportCostRecordCommandService
   * .getOperationalStatusesForIds) -- one query per page rather than
   * one findById per row. Uses findManyInScope (not a manual
   * accessibleOrgUnitIds check) so this goes through the exact same
   * scoping helper every other in-scope read in this module already
   * uses; an id from another org unit or tenant is silently absent from
   * the result, never a thrown error, matching the 404-not-403
   * existence-hiding discipline findInScope/conditionalUpdate use
   * elsewhere in this file.
   */
  async findByIdsInScope(ids: string[], context: TenantContext): Promise<TransportCostSourceRecord[]> {
    const validIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => this.toObjectId(id));
    if (validIds.length === 0) return [];
    // Same cast bulkSetField below uses: BaseEntity's `_id?: string`
    // doesn't line up with Mongo's actual ObjectId `_id`, so `$in` over
    // ObjectId[] needs the wider Record cast, not Filter<T> directly.
    const filter: Record<string, unknown> = { _id: { $in: validIds } };
    return this.findManyInScope(filter as Filter<TransportCostSourceRecord>, context, { limit: validIds.length });
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
