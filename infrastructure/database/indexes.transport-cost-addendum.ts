// infrastructure/database/indexes.transport-cost-addendum.ts
//
// Olivine transport-cost work, Phases O1/O2. tbltransportcostsourcerecords
// had no index definitions anywhere in this file (Phase O1 shipped
// without them, deferred here per that phase's own scope note); the
// three Phase O2 collections are new. Every index below is derived
// directly from an actual filter/sort in the corresponding repository
// (see modules/transport-cost/repositories/*.ts) -- none is
// speculative, following indexes.finance-addendum.ts's convention.
//
// CONVENTION (same as indexes.finance-addendum.ts): tenantId leads
// every index. For tbltransportcostsourcerecords (org-unit scoped),
// org-unit narrowing happens via tenantScopeService.buildFilter() at
// query time over a caller-specific, variable-length orgUnitId list --
// not a good leading/equality compound-index field, so it is
// deliberately left out of these compound keys, exactly like the
// finance addendum's own reasoning. The three Phase O2 collections are
// ORGANIZATION-level (see module-scope.registry.ts's "MIXED-LEVEL
// MODULE" note) -- plain tenantId scoping only, no orgUnitId to
// consider at all.

export const TRANSPORT_COST_INDEXES = {
  tbltransportcostsourcerecords: [
    {
      // TransportCostSourceRecordRepository.findLikelyDuplicate:
      // {tenantId, sheetFamily, registration, date: range, amount} --
      // the O1 import-time duplicate check, run once per row on every
      // import.
      key: { tenantId: 1, sheetFamily: 1, registration: 1, date: 1 },
      name: 'idx_transportcostsrc_tenant_family_reg_date',
    },
    {
      // findByImportBatch (sorted sourceRowNumber asc) and
      // countByImportBatch: {tenantId, importBatchId}. The importer's
      // own "did every row land" verification (audit Section S) hits
      // this on every batch.
      key: { tenantId: 1, importBatchId: 1, sourceRowNumber: 1 },
      name: 'idx_transportcostsrc_tenant_batch_row',
    },
    {
      // GetTransportCostSourceRecordsHandler's default listing (no
      // filters beyond scope), sorted createdAt desc -- BaseRepository's
      // default sort.
      key: { tenantId: 1, createdAt: -1 },
      name: 'idx_transportcostsrc_tenant_created',
    },
    {
      // ADDED, Phase O4. countPendingAmount: {tenantId, sheetFamily:
      // 'third-party', amount: null, date: range} -- the report screen's
      // "this total includes pending rows" banner check, run on every
      // O4 report request.
      key: { tenantId: 1, sheetFamily: 1, amount: 1, date: 1 },
      name: 'idx_transportcostsrc_tenant_family_amount_date',
    },
    // Deliberately NO index for the O2 backfill script's "unresolved
    // rows" query ({transporterPartnerId: $exists:false} OR
    // {registration: $ne:null, contractedVehicleId: $exists:false}).
    // Indexing "field absent" does not accelerate an $exists:false
    // predicate the way an equality index does, and this query runs
    // only from an operator-invoked backfill script, not a request
    // path -- see scripts/backfill-transport-cost-normalization.ts's
    // header. A collection-scoped scan there is an accepted trade-off,
    // not an oversight.
  ],

  // ── Item 6, data-quality exceptions (org-unit scoped, same as
  //    tbltransportcostsourcerecords above). ──────────────────────────
  tbltransportcostimportexceptions: [
    {
      // TransportCostImportExceptionRepository.findByImportBatchIds,
      // sorted sourceRowNumber asc -- the exceptions report's sole read
      // path, run once per O4 "Export exceptions" request. Same shape
      // as tbltransportcostsourcerecords' own batch index above,
      // deliberately: this collection is queried by the same
      // importBatchId set that query already resolved.
      key: { tenantId: 1, importBatchId: 1, sourceRowNumber: 1 },
      name: 'idx_transportcostimportexception_tenant_batch_row',
    },
  ],

  // ── Phase O2 master data (organization-level). ─────────────────────
  tbltransportpartners: [
    {
      // TransportPartnerRepository.findByExactNameOrAlias's
      // canonicalName branch of its $or -- the first, cheapest check
      // the O2 matcher runs on every row.
      key: { tenantId: 1, canonicalName: 1 },
      name: 'idx_transportpartner_tenant_canonicalname',
    },
    {
      // Same method's aliases branch. `aliases` is an array, so this is
      // a multikey index -- Mongo cannot serve both $or branches from
      // one compound index across two different fields, hence two
      // indexes rather than one.
      key: { tenantId: 1, aliases: 1 },
      name: 'idx_transportpartner_tenant_aliases',
    },
    {
      // findAllForMatching's filter: {rejected: $ne true,
      // mergedIntoPartnerId: $exists false}. A regular (non-sparse)
      // index still covers an $exists:false predicate -- sparse would
      // do the opposite (index only rows where the field DOES exist),
      // which is not what this query needs.
      key: { tenantId: 1, rejected: 1, mergedIntoPartnerId: 1 },
      name: 'idx_transportpartner_tenant_rejected_merged',
    },
    {
      key: { tenantId: 1, reviewStatus: 1 },
      name: 'idx_transportpartner_tenant_reviewstatus',
    },
  ],
  tblcontractedvehicles: [
    {
      // ContractedVehicleRepository.findByRegistration, and the
      // uniqueness invariant itself: two ContractedVehicle rows for the
      // same tenant with the same normalized registration would mean
      // two different "identities" for one physical plate, which the
      // whole point of Phase O2 is to prevent. Registration is always
      // populated on this type (never null, unlike the source record's
      // own nullable field), so a plain (non-partial) unique index is
      // correct here.
      key: { tenantId: 1, registration: 1 },
      name: 'uniq_contractedvehicle_tenant_registration',
      unique: true,
    },
    {
      key: { tenantId: 1, transporterPartnerId: 1 },
      name: 'idx_contractedvehicle_tenant_transporter',
    },
    {
      // findConfirmedByBusinessStream -- O4's Stream -> Vehicle
      // drill-down level. Sparse: businessStream is optional and most
      // rows will not have it until Section R item 1's business-stream
      // identity question is confirmed (see the type's own doc
      // comment).
      key: { tenantId: 1, businessStream: 1, reviewStatus: 1 },
      name: 'idx_contractedvehicle_tenant_stream_reviewstatus',
      sparse: true,
    },
    {
      key: { tenantId: 1, reviewStatus: 1 },
      name: 'idx_contractedvehicle_tenant_reviewstatus',
    },
  ],
  tblnormalizationreviewitems: [
    {
      // findPendingByRawValue -- the exact-lookup hot path, called once
      // per unresolved transporter/vehicle on every import row (via the
      // O2 matcher) and once per backfill row.
      key: { tenantId: 1, kind: 1, rawValue: 1, status: 1 },
      name: 'idx_normreview_tenant_kind_rawvalue_status',
    },
    {
      // findPending / countPending -- the review queue's own listing,
      // sorted createdAt desc (BaseRepository's default). Serves both
      // the kind-filtered and kind-omitted call shapes; an omitted kind
      // filter is evaluated in-memory over this index's scan window,
      // the same trade-off indexes.finance-addendum.ts documents for
      // its own multi-shape queries.
      key: { tenantId: 1, status: 1, createdAt: -1 },
      name: 'idx_normreview_tenant_status_created',
    },
  ],

  // ── Phase O3 master data (organization-level). ─────────────────────
  tbltransportcostvatconfigs: [
    {
      // TransportCostVatConfigRepository.findByImportBatch -- checked on
      // every postSourceRecord call, before the sheetFamily-wide
      // fallback below. Sparse: importBatchId is absent on every
      // sheetFamily-wide row.
      key: { tenantId: 1, importBatchId: 1 },
      name: 'idx_transportcostvatconfig_tenant_batch',
      sparse: true,
    },
    {
      // TransportCostVatConfigRepository.findForSheetFamily: {tenantId,
      // sheetFamily, importBatchId: $exists false}, sorted updatedAt
      // desc, limit 1 -- the fallback checked on every postSourceRecord
      // call whose source record carries no batch-specific override.
      key: { tenantId: 1, sheetFamily: 1, updatedAt: -1 },
      name: 'idx_transportcostvatconfig_tenant_family_updated',
    },
  ],

  // ── Slice 3 master data (organization-level, same reasoning as the
  //    Phase O2/O3 collections above). ────────────────────────────────
  tblcustomers: [
    {
      // CustomerRepository.findByNormalizedName -- the find-or-create
      // duplicate-protection pre-check MasterDataService.createCustomer
      // runs on every "+ Add New Customer" submission, AND the race
      // defense-in-depth layer: unique so two concurrent creates for the
      // same normalized name can never both land (see
      // MasterDataService.findOrCreateNamed's header).
      key: { tenantId: 1, normalizedName: 1 },
      name: 'uniq_customer_tenant_normalizedname',
      unique: true,
    },
    {
      // CustomerRepository.search: {tenantId, active: true, name:
      // contains}, sorted name asc -- the type-ahead dropdown's own read
      // path, hit on every keystroke (debounced client-side).
      key: { tenantId: 1, active: 1, name: 1 },
      name: 'idx_customer_tenant_active_name',
    },
  ],
  tbldestinations: [
    {
      // DestinationRepository.findByNormalizedName -- identical
      // reasoning to tblcustomers' own uniq_customer_tenant_normalizedname
      // above.
      key: { tenantId: 1, normalizedName: 1 },
      name: 'uniq_destination_tenant_normalizedname',
      unique: true,
    },
    {
      // DestinationRepository.search -- identical reasoning to
      // tblcustomers' own idx_customer_tenant_active_name above.
      key: { tenantId: 1, active: 1, name: 1 },
      name: 'idx_destination_tenant_active_name',
    },
  ],
} as const;
