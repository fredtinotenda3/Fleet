// infrastructure/database/indexes.finance-addendum.ts
//
// PHASE 0, ITEM 4: tblallocationledger, tbldepreciationprofiles, and
// tblglsubmissions had no index definitions anywhere in this file --
// confirmed by grepping every indexes.*.ts for the three collection
// names before writing this. Every index below is derived directly
// from an actual filter/sort in the corresponding repository (see
// modules/finance/repositories/*.ts) -- none is speculative.
//
// CONVENTION: like every other addendum here (see
// indexes.anomaly-addendum.ts), org-unit scoping is applied by
// tenantScopeService.buildFilter() at query time, usually as an
// `orgUnitId: { $in: [...] }` over a caller-specific, variable-length
// list -- not a good leading/equality compound-index field. `tenantId`
// (always an equality match, and the field with by far the highest
// selectivity) leads every index; org-unit narrowing happens within
// the tenantId-scanned range.

export const FINANCE_INDEXES = {
  tblallocationledger: [
    {
      // AllocationLedgerRepository.findByVehicleInScope: filters by
      // {tenantId, vehicleId}, sorts postedAt desc. Also the prefix
      // AllocationLedgerRepository.buildFilter's vehicleId-only list
      // path hits.
      key: { tenantId: 1, vehicleId: 1, postedAt: -1 },
      name: 'idx_allocationledger_tenant_vehicle_posted',
    },
    {
      // AllocationLedgerRepository.findReversalOf: {tenantId,
      // reversalOfPostingId}, limit 1. reversalOfPostingId is absent
      // on the (large majority of) non-reversing postings, so this is
      // a sparse, cheap index rather than one entry per row.
      key: { tenantId: 1, reversalOfPostingId: 1 },
      name: 'idx_allocationledger_tenant_reversalof',
      sparse: true,
    },
    {
      // getNetTotalsByCategory: {tenantId, vehicleId,
      // periodStart: $gte, periodEnd: $lte} for the cost-per-km
      // aggregation. periodStart is the range bound actually used to
      // narrow the scan (periodEnd is checked but every posting's
      // period is short, so periodStart already discriminates almost
      // as tightly as both together would).
      key: { tenantId: 1, vehicleId: 1, periodStart: 1 },
      name: 'idx_allocationledger_tenant_vehicle_periodstart',
    },
    {
      // getNetTotalsByGlAccount: {tenantId, glAccountCode: $exists,
      // periodStart: $gte, periodEnd: $lte} for the GL reconciliation
      // "platform total" aggregation, grouped by glAccountCode.
      key: { tenantId: 1, glAccountCode: 1, periodStart: 1 },
      name: 'idx_allocationledger_tenant_glaccount_periodstart',
      sparse: true,
    },
  ],
  tbldepreciationprofiles: [
    {
      // findByVehicleInScope: {tenantId, vehicleId}, sort createdAt
      // desc, limit 1 (most-recent-wins for the rare pre-write-guard
      // duplicate -- see the repository's doc comment). The same
      // {tenantId, createdAt: -1} prefix also serves findAllInScope
      // (no vehicleId filter, same sort), so one compound index covers
      // both call sites.
      key: { tenantId: 1, vehicleId: 1, createdAt: -1 },
      name: 'idx_depreciationprofile_tenant_vehicle_created',
    },
  ],
  tblglsubmissions: [
    {
      // findInPeriodInScope: {tenantId, periodStart: $gte,
      // periodEnd: $lte}, sort submittedAt desc. findLatestPerAccountInScope
      // reduces this same result set in application code (see that
      // method's doc comment for why it is deliberately NOT a second
      // aggregation pipeline), so this single index serves both.
      key: { tenantId: 1, periodStart: 1, submittedAt: -1 },
      name: 'idx_glsubmission_tenant_periodstart_submitted',
    },
  ],
} as const;
