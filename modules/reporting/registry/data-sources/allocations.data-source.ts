// modules/reporting/registry/data-sources/allocations.data-source.ts
//
// R.3.7 -- FINANCIAL / COST INTELLIGENCE REPORTING.
//
// Registers an `allocations` data source over `tblallocationledger` --
// the cost-per-km engine's own evidence trail (see
// modules/finance/types/allocation.types.ts) -- so a report author can
// finally build a row-level, ledger-backed financial report (filter/
// group/sort/export/schedule) through the existing Report Builder.
//
// WHY THIS IS THE GENUINE R.3.7 GAP (not scope creep):
// The Phase 1/2 audit confirmed `expenses`, `fuel`, `maintenance`, and
// `workorders` -- the four data sources that already touch cost data --
// expose ZERO allocation-ledger, GL, depreciation, or FX fields (read
// directly from bootstrap-data-sources.ts). The generic reporting/
// export/scheduling infrastructure therefore has NO path to the one
// collection that is actually this platform's financial truth (the net,
// currency-normalized, reversal-aware figures VehicleCostsPanel.tsx and
// GLReconciliationPage.tsx already read on their own bespoke pages).
// This closes that gap WITHOUT building a second reporting engine, a
// third cost-per-km implementation, or a new bespoke dashboard --
// VehicleCostsPanel/GLReconciliationPage already own the "per vehicle"
// and "vs GL" views; this is the "ad-hoc, filter/group/export/schedule
// anything from the ledger" view neither of those bespoke pages offers
// and the platform had no way to offer.
//
// SECURITY:
//   - `tblallocationledger` is already listed in server/tenancy/
//     module-scope.registry.ts's orgUnitScopedCollections() (module:
//     'finance', orgUnitSource: 'vehicle', confirmed: true), so
//     report-query.engine.ts's pushdown path applies the identical
//     `orgUnitId`-scoped predicate to this source automatically -- see
//     tests/security/report-scope.spec.ts, extended in this delivery.
//   - `requiredPermission: Permission.FINANCE_VIEW` -- the SAME
//     permission every other allocation-ledger read path already
//     requires (GET /api/finance/allocations, GET /api/finance/
//     cost-per-km, GET /api/finance/gl/reconciliation). Enforced by
//     modules/reporting/utils/data-source-authorization.ts, wired into
//     the Report Builder's preview/drilldown/export/schedule
//     checkpoints as a PREREQUISITE fix applied to this whole engine
//     (see that file's doc comment) -- this source is the first one to
//     ship WITH the gate already in place, rather than needing a
//     retrofit.
//
// DATA TRUTH:
//   - `amount`/`currency` (the ORIGINAL transaction currency and
//     amount) are exposed for audit/display but deliberately marked
//     `aggregatable: false`. A report grouping postings across vehicles
//     or periods can legitimately span multiple original transaction
//     currencies, and summing raw `amount` across them would produce a
//     number with no meaning -- exactly the failure
//     AllocationService.getCostPerKm's own `mixed` guard exists to
//     prevent. This engine has no per-report currency-mixing guard (see
//     the R.3.7 handoff for why building one is out of scope here), so
//     the one honest choice is to never mark the ambiguous field
//     summable in the first place.
//   - `reportingAmount` IS `aggregatable: true`. Every posting's
//     reportingAmount is already normalized into the tenant's ONE
//     configured reporting currency (FinanceSettingsService.resolve),
//     so summing it is mathematically valid UNLESS a report's date
//     range spans an organization-wide reporting-currency change (a
//     rare, audited event -- FinanceSettingsService.update's own
//     warning covers it). `reportingCurrency` is always included as a
//     groupable column precisely so that ambiguity is VISIBLE on the
//     report rather than hidden -- a report author who groups by
//     reportingCurrency alongside a sum will see two rows instead of
//     one silently-wrong total.
//   - `quantity`/`unit` (the denominator a non-'direct' allocation was
//     spread over) are exposed but not aggregatable, for the same
//     mixed-unit reason: km, days, engine-hours, and driver-shares
//     cannot be meaningfully summed together.
//   - `isReversal` is DERIVED in Mongo (never in Node -- see
//     DataSourceDefinition.prePipeline's own doc comment) from whether
//     `reversalOfPostingId` is set. A reversing posting is a REAL
//     posting, not filtered out -- the ledger is append-only and a
//     correction is evidence, not noise (see allocation-ledger.
//     repository.ts's own doc comment) -- so this column exists
//     precisely so a report author can choose to include or exclude
//     reversals explicitly, rather than the source silently doing
//     either for them.
//   - `sourceCollection` is exposed raw (not resolved further): it is
//     itself the provenance pointer AllocationPosting.sourceCollection
//     documents (tblexpenses/tblfuellogs/tblreminders/tblworkorders/
//     finance:depreciation/finance:shared-cost) -- surfacing it lets a
//     report distinguish e.g. depreciation charges from real cash
//     transactions without fabricating a second taxonomy.

import { Document } from 'mongodb';
import { DataSourceDefinition } from '../../types/data-source.types';
import { Permission } from '@/server/permissions/roles';
import { orgUnitLookupStages } from '../bootstrap-data-sources';

function tenantScoped(tenantId: string) {
  return { tenantId, isDeleted: { $ne: true } };
}

const ORG_UNIT_FIELDS = [
  { key: 'orgUnitId', label: 'Org Unit ID', type: 'string' as const, aggregatable: false, groupable: true },
  { key: 'orgUnitName', label: 'Branch', type: 'string' as const, aggregatable: false, groupable: true },
];

/**
 * Resolves `vehicleId` -> `license_plate` (tblvehicles) and `driverId`
 * -> `driverName` (tbldrivers), and derives `isReversal` from whether
 * `reversalOfPostingId` is set. The `$toString` comparisons on both
 * sides mirror alerts.data-source.ts's vehicleLookupStages / workorders.
 * data-source.ts's bay/mechanic lookups exactly, for the identical
 * reason: whether an id is stored as a string or an ObjectId-shaped
 * value isn't guaranteed, and this join works correctly either way.
 *
 * `driverId` is optional on AllocationPosting (only meaningful for the
 * 'driver-allocated' allocationRule) -- a posting with none reports
 * `driverName: null`, never a guessed or defaulted name.
 */
function vehicleAndDriverLookupStages(): Document[] {
  return [
    {
      $lookup: {
        from: 'tblvehicles',
        let: { vId: '$vehicleId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$vId' }] } } },
          { $project: { license_plate: 1 } },
        ],
        as: '__vehicle',
      },
    },
    { $unwind: { path: '$__vehicle', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'tbldrivers',
        let: { dId: '$driverId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $ne: ['$$dId', null] }, { $eq: [{ $toString: '$_id' }, { $toString: '$$dId' }] }] } } },
          { $project: { name: 1 } },
        ],
        as: '__driver',
      },
    },
    { $unwind: { path: '$__driver', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        license_plate: { $ifNull: ['$__vehicle.license_plate', null] },
        driverName: { $ifNull: ['$__driver.name', null] },
        isReversal: { $toBool: { $ifNull: ['$reversalOfPostingId', false] } },
      },
    },
    { $project: { __vehicle: 0, __driver: 0 } },
  ];
}

export const allocationsDataSource: DataSourceDefinition = {
  key: 'allocations',
  label: 'Cost Allocations',
  collectionName: 'tblallocationledger',
  baseFilter: tenantScoped,
  requiredPermission: Permission.FINANCE_VIEW,
  prePipeline: () => [...vehicleAndDriverLookupStages(), ...orgUnitLookupStages()],
  fields: [
    { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
    { key: 'vehicleId', label: 'Vehicle ID', type: 'string', aggregatable: false, groupable: true },
    { key: 'driverName', label: 'Driver', type: 'string', aggregatable: false, groupable: true },
    { key: 'driverId', label: 'Driver ID', type: 'string', aggregatable: false, groupable: false },
    { key: 'costCategory', label: 'Cost Category', type: 'string', aggregatable: false, groupable: true },
    { key: 'allocationRule', label: 'Allocation Rule', type: 'string', aggregatable: false, groupable: true },
    { key: 'sourceCollection', label: 'Source', type: 'string', aggregatable: false, groupable: true },
    { key: 'sourceId', label: 'Source Record ID', type: 'string', aggregatable: false, groupable: false },
    { key: 'description', label: 'Description', type: 'string', aggregatable: false, groupable: false },
    { key: 'periodStart', label: 'Period Start', type: 'date', aggregatable: false, groupable: false },
    { key: 'periodEnd', label: 'Period End', type: 'date', aggregatable: false, groupable: false },
    // Not aggregatable -- a rule other than 'direct' spreads the cost
    // over km/day/engine-hour/driver-share, and those units cannot be
    // meaningfully summed together across mixed allocationRule rows.
    { key: 'quantity', label: 'Quantity', type: 'number', aggregatable: false, groupable: false },
    { key: 'unit', label: 'Unit', type: 'string', aggregatable: false, groupable: true },
    // Original transaction currency/amount -- NOT aggregatable. See this
    // file's header for why summing across possibly-mixed currencies
    // would be a fabricated figure.
    { key: 'currency', label: 'Original Currency', type: 'string', aggregatable: false, groupable: true },
    { key: 'amount', label: 'Original Amount', type: 'currency', aggregatable: false, groupable: false },
    { key: 'fxRate', label: 'FX Rate', type: 'number', aggregatable: false, groupable: false },
    { key: 'fxRateDate', label: 'FX Rate Date', type: 'date', aggregatable: false, groupable: false },
    { key: 'fxSource', label: 'FX Source', type: 'string', aggregatable: false, groupable: true },
    { key: 'reportingCurrency', label: 'Reporting Currency', type: 'string', aggregatable: false, groupable: true },
    // The one genuinely summable monetary figure -- already normalized
    // into the tenant's single configured reporting currency. See this
    // file's header for the residual multi-currency-period caveat.
    { key: 'reportingAmount', label: 'Reporting Amount', type: 'currency', aggregatable: true, groupable: false },
    { key: 'glAccountCode', label: 'GL Account Code', type: 'string', aggregatable: false, groupable: true },
    { key: 'postedAt', label: 'Posted At', type: 'date', aggregatable: false, groupable: false },
    { key: 'postedBy', label: 'Posted By (User ID)', type: 'string', aggregatable: false, groupable: false },
    { key: 'isReversal', label: 'Is Reversal', type: 'boolean', aggregatable: false, groupable: true },
    { key: 'reversalOfPostingId', label: 'Reverses Posting ID', type: 'string', aggregatable: false, groupable: false },
    { key: 'reversalReason', label: 'Reversal Reason', type: 'string', aggregatable: false, groupable: false },
    ...ORG_UNIT_FIELDS,
  ],
  fetch: async (tenantId) => {
    const { allocationLedgerRepository } = await import('@/modules/finance/repositories/allocation-ledger.repository');
    const result = await allocationLedgerRepository.findMany({}, tenantId, { limit: 10000 });
    return result as unknown as Array<Record<string, unknown>>;
  },
};
