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
    {
      // PHASE 6 -- THE AUTO-POSTING IDEMPOTENCY CONSTRAINT.
      //
      // Postings are triggered from domain events under Phase 3's
      // at-least-once delivery. Without this, a redelivered event posts
      // the same amount twice -- and because this ledger is APPEND-ONLY
      // there is no update to correct it; the only remedy is a reversing
      // posting, which needs a human to notice a plausible-looking
      // number.
      //
      // PARTIAL, because manually-created postings carry no key and are
      // a deliberate human act that may legitimately repeat. A plain
      // unique index would collapse every manual posting in a tenant
      // into one.
      key: { tenantId: 1, idempotencyKey: 1 },
      name: 'uniq_allocationledger_tenant_idempotency',
      unique: true,
      partialFilterExpression: { idempotencyKey: { $exists: true } },
    },
    {
      // ADDED, Phase O3. AllocationLedgerRepository.findBySource:
      // {tenantId, sourceCollection, sourceId, costCategory} --
      // TransportCostPostingService's own idempotent-replay/correction
      // check, run on every postSourceRecord call. Not served by the
      // idempotencyKey unique index above: that index answers "does THIS
      // exact key exist", this query answers "what is the whole posting
      // history for this source", which a correction's version-suffixed
      // key cannot answer alone (see that repository method's own doc
      // comment).
      key: { tenantId: 1, sourceCollection: 1, sourceId: 1, costCategory: 1 },
      name: 'idx_allocationledger_tenant_source',
    },
    {
      // ADDED, Command Centre Slice A0 (pre-existing gap closed during the
      // OLIVINE LIVE OPERATING MODEL verification pass). getNetTotalsBy
      // VehicleForCategory and findRawByCategoryInScope both filter by
      // {tenantId, costCategory, periodStart: $gte, periodEnd: $lte} --
      // grouped by vehicleId in the former, returned raw in the latter --
      // and neither was backed by a costCategory-leading index: the only
      // pre-existing tblallocationledger indexes led with vehicleId or
      // glAccountCode, never costCategory alone, so this cross-vehicle,
      // one-category-in-scope query pattern fell back to a full tenant
      // scan. tests/security/finance-indexes.spec.ts already asserted
      // this exact index shape (Command Centre Slice A0's own pinning
      // test) but the index itself was never added -- caught by running
      // that suite during this pass's verification, fixed here rather
      // than left failing, since it directly backs the same aggregation
      // family (and the same file) the costFacingCompany index just below
      // was added for.
      key: { tenantId: 1, costCategory: 1, periodStart: 1 },
      name: 'idx_allocationledger_tenant_costcategory_periodstart',
    },
    {
      // ADDED, OLIVINE LIVE OPERATING MODEL. getNetTotalsByCompanyAcrossVehicles:
      // {tenantId, costCategory: $in, costFacingCompany, periodStart: $gte}
      // -- the company-dimension dashboard breakdown, the client's own
      // "primary analytical dimension". Sparse: absent on every posting
      // outside the three transport-cost categories, and on any
      // transport-cost posting whose source predates this field.
      key: { tenantId: 1, costFacingCompany: 1, periodStart: 1 },
      name: 'idx_allocationledger_tenant_costfacingcompany_periodstart',
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
