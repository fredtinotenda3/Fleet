# Olivine Cost Intelligence Command Centre — Design Document

**Status: DESIGN. No implementation code has been written yet.** This document is the required first deliverable for the "OLIVINE — NEXT MILESTONE" instruction, produced by reading the actual current codebase (not assumed, not from memory of earlier phases) before any line of Command Centre code exists. Per that instruction, once this document is complete, implementation proceeds autonomously in the safest, smallest dependency-safe order (Section 25), without waiting for a further approval round on ordinary engineering decisions.

Everything below is grounded in files actually opened during this design phase. Where a claim could not be verified against real data or real code in the time available, it is marked **UNVERIFIED — confirm before relying on it** rather than stated as fact. This mirrors the discipline that caught the Depot STO vehicle-identity and May-product-quantity mistakes before delivery: verify against the real artifact, never against what a doc comment or an earlier assumption says.

---

## 1. Current architecture (as it actually exists today)

The transport-cost feature is a five-stage pipeline, already shipped end-to-end for three source families (Vansales, Swift, Depot STO/O5) plus the original 3rd Party family:

```
Source Data (Olivine Excel workbooks)
  -> Source Evidence   (tbltransportcostsourcerecords, via ImportTransportCostHandler)
  -> Normalization     (tblnormalizationreviewitems, human-confirmed, never auto-merged)
  -> Allocation Ledger (tblallocationledger, via TransportCostPostingService.postSourceRecord)
  -> Reporting / Intelligence (TransportCostReportService, today: one screen, third-party-transport only)
```

This is the authoritative architecture named in the milestone instruction, and it already exists — this design does not introduce it, it extends the last stage only.

**A second, genuinely separate reporting system also exists and was verified this session**: `modules/reporting/registry/DataSourceRegistry.ts` and `modules/reporting/services/report-query.engine.ts` (`ReportQueryEngine`) are real, not hypothetical. They back the platform's generic, user-authored **Report Builder** (ad-hoc filter/group/sort/export/schedule against a registered `DataSourceKey`: `vehicles`, `expenses`, `fuel`, `maintenance`, `trips`, `drivers`, `organizations`, `alerts`, `workorders`, and — since R.3.7 — `allocations`, which already reads `tblallocationledger`). Section 2 explains why the Command Centre is **not** built on top of this engine, even though it is real and already touches the ledger.

Also confirmed real and relevant:
- `TenantScopedRepository` — every repository in this design extends it.
- `AllocationLedgerRepository` (`modules/finance/repositories/allocation-ledger.repository.ts`, 469 lines, read in full) — the ledger's only read/write surface. Append-only: `update`/`softDelete`/`hardDelete` are overridden to throw.
- `TransportCostReportService` (`modules/transport-cost/services/transport-cost-report.service.ts`, read in full) — the existing Phase O4 report service this milestone extends.
- `server/tenancy/module-scope.registry.ts` (read in full) — the single source of truth for which collections are org-unit scoped and how.

## 2. Existing reporting capabilities

Two independent, real reporting surfaces exist over cost data today:

**A. `TransportCostReportService`** (purpose-built, `TRANSPORT_COST_VIEW`-gated, the one the milestone instruction names):
- `getAllocationReport(context, periodStart, periodEnd)` — Stream → Vehicle totals for **one hardcoded cost category, `'third-party-transport'`** (`const COST_CATEGORY = 'third-party-transport' as const`, line 89). Sourced entirely from `AllocationLedgerRepository.getNetTotalsByVehicleForCategory`, a real Mongo `$match`+`$group` pipeline (grouped by `{vehicleId, reportingCurrency}`, summing `reportingAmount`). Business Stream is rolled up **in Node**, after the Mongo aggregation, by joining the vehicle-grouped totals against `ContractedVehicle.businessStream` — this is the existing precedent for "dimension not on the posting itself, resolve via vehicle."
- `getPostingsForVehicle(context, contractedVehicleId, periodStart, periodEnd)` — the existing single-vehicle drill-down (`PostingDrillDown`), feeding `VehicleDrillDownDialog.tsx`.
- `getAvailableMonths(context)` — thin wrapper on `AllocationLedgerRepository.getDistinctPostedMonths`.
- `getDataQualityExceptions(context, periodStart, periodEnd)` — rejected/duplicate/period-outlier rows, resolved by finding which import batches produced an in-period posting, then pulling every exception and every out-of-period posting for those same batches. This is the existing precedent for "bounded raw fetch + Node-side join to source records," reused heavily below.

**B. `ReportQueryEngine` / `allocationsDataSource`** (generic, `FINANCE_VIEW`-gated, ad-hoc): a fully server-side Mongo pushdown engine — `$match` (tenant scope + org-unit predicate + user filters) → optional `$group` (groupBy/aggregations) → `$sort` → `$facet` (paginated data + count + totals) — registered against `tblallocationledger` with vehicle/driver name resolution via `$lookup`, and a deliberate discipline around which fields are `aggregatable` (only `reportingAmount`; raw `amount`/`currency`/`quantity` are excluded to prevent silently summing mixed currencies/units — see `allocations.data-source.ts`'s header). This is real, tested (`tests/unit/reports/allocations-data-source.spec.ts`, `tests/security/report-scope.spec.ts`), and already org-unit-scoped via the same `orgUnitScopedCollections()` registry used everywhere else.

**Decision: the Command Centre extends (A), not (B).**
**Reason:** (B) is the generic, user-authored ad-hoc Report Builder — a different product surface, gated on `FINANCE_VIEW` (broader/different than `TRANSPORT_COST_VIEW`), with a field catalogue that has no concept of business stream, destination, source family, or transport-cost data-quality states, and no route to add those without either polluting a generic financial data source with transport-cost-specific fields or forking it. (A) is the exact purpose-built service the milestone instruction names, already `TRANSPORT_COST_VIEW`-gated (matching every other transport-cost read endpoint), and already contains the two precedents (vehicle-grouped Mongo aggregation + Node-side dimension roll-up; bounded-fetch + Node-side source-record join) that this design needs. Building the Command Centre on (B) would be introducing a second, parallel way to read the same ledger for the same purpose — the thing the instruction explicitly forbids ("do NOT introduce a parallel cost-calculation engine").
**Assumption:** a future, separate need ("let an Olivine finance user build their own ad-hoc pivot over the ledger") is a legitimate use of (B) as-is and is out of scope here.
**Reversibility:** if this assumption is wrong, nothing here blocks adding transport-cost fields to `allocationsDataSource` later — it is additive to a different file with no dependency on this design.

## 3. Existing ledger capabilities

`AllocationPosting` (`modules/finance/types/allocation.types.ts`, read in full) fields relevant to this design: `vehicleId`, `driverId?`, `costCategory: AllocationCostCategory`, `allocationRule`, `sourceCollection`, `sourceId`, `description`, `periodStart`, `periodEnd`, `quantity?`, `unit?`, `currency`, `amount`, `fxRate`, `fxRateDate`, `fxSource`, `reportingCurrency`, `reportingAmount`, `glAccountCode?`, `postedAt`, `postedBy`, `reversalOfPostingId?`, `reversalReason?`, `orgUnitId`, `tenantId`, `isDeleted`.

**Confirmed absent from `AllocationPosting`:** `destination`, `businessStream`, `sheetFamily`/source-family. These do not exist on a posting today and are not silently derivable from a field name — Section 16/17 covers how each is resolved without a schema change.

`AllocationCostCategory` = `'fuel'|'maintenance'|'expense'|'depreciation'|'insurance'|'other'|'third-party-transport'|'transport-retainer'|'stock-transfer'`. Only the last three are transport-cost categories. `costCategoryMatch()` (private helper, `allocation-ledger.repository.ts` line 75) already accepts `AllocationCostCategory | AllocationCostCategory[]` and every read method in the repository already threads that through — **widening from one category to the three transport-cost categories is a query-parameter change, not a schema or repository-architecture change**, exactly as the existing header comment on `TransportCostReportService` already documents.

The `FULLY CONTAINED` period rule (`buildPeriodFilter`, both `periodStart >= X` and `periodEnd <= Y`) is the ledger-wide convention for every total-producing query, standardised specifically so line items always sum to the header total. `countSpanningPostings` exists so postings excluded by that rule are counted, never silently dropped. The Command Centre reuses this rule unchanged for every new aggregation.

## 4. Existing source-record lineage

`TransportCostSourceRecord` (`shared/types/transport-cost.types.ts`) already carries full provenance on every row: `importBatchId`, `sourceFileName`, `sourceRowNumber` (sheet row number as originally in the workbook), `sheetFamily: TransportCostSheetFamily`, plus family-specific raw fields (`ThirdPartySourceFields`/`VansalesSourceFields`/`SwiftSourceFields`/`DepotStoSourceFields`) and normalized fields (`registrationRaw`, `transporterRaw`, `rawDate`, `destinationTown?`). This is already exactly what Slice B's "source file/sheet/row number, raw provenance" requirement needs — no new storage, per the instruction's explicit "extend existing source-record infrastructure ... do not create another storage system."

`destinationTown?: string` is declared once on the shared `TransportCostSourceRecord` type, not per-family. Its actual population per family is **UNVERIFIED — confirm before relying on it** (Section 16).

`AllocationPosting.sourceId` already points back to the originating `TransportCostSourceRecord._id`, and `TransportCostSourceRecordRepository.findManyByIds(ids, context)` already exists as a bulk (non-N+1) resolver — used today by `getDataQualityExceptions`. This is the exact join Slice A (destination/source-family/time buckets) and Slice B (drill-down enrichment) both reuse.

## 5. Proposed Command Centre information architecture

One new page, reusing the platform's existing visual components (`Table`, `Badge`, `Dialog`, the existing period/month picker pattern from `TransportCostReportPage.tsx`) — no new design language, per the instruction.

```
Command Centre
 ├─ Header: period selector (day/week/month/custom range), business-stream filter, source-family filter
 ├─ Headline numbers: Total transport cost (reportingAmount, mixed-currency-safe), record counts (posted / pending / excluded)
 ├─ Time-series trend chart (bucketed by the selected granularity)
 ├─ Breakdown tabs/panels: by Business Stream · by Vehicle · by Transporter · by Destination · by Cost Category · by Source Family
 │    each row clickable -> drill-down (Slice B)
 ├─ Data Quality / Trust panel (Slice C): Unresolved vehicle / Missing cost / Duplicate / Rejected / Unattributed / Period anomaly / Not-posted, counts + reasons, explicitly overlapping-vs-exclusive
 └─ Drill-down dialog: posting-level detail -> source-evidence detail (extends VehicleDrillDownDialog.tsx)
```

This is additive: the existing `TransportCostReportPage.tsx` (single-month, third-party-transport-only) is left in place and untouched — it already has its own value as the O4 minimal slice — and the Command Centre is a new page/route, per "do not unnecessarily replace" and "extend, don't rebuild."

## 6. Slice A design — cost aggregation + time series

### 6.0 Prerequisite fixes (must ship with, not after, Slice A — see Section 25 for why)

1. **Widen the cost-category scope.** Replace `TransportCostReportService`'s single `COST_CATEGORY` constant with `TRANSPORT_COST_CATEGORIES: AllocationCostCategory[] = ['third-party-transport', 'transport-retainer', 'stock-transfer']`, threaded through every existing call (`getNetTotalsByVehicleForCategory`, `getDistinctPostedMonths`, `findRawByCategoryInScope`, `findBySourceIdsForCategory`, `countPendingAmount`) — all four repository methods already accept an array via `costCategoryMatch()`, so this is exactly the "query-parameter change" the existing header comment already promises.
2. **Fix `extractRawDisplayFields`'s latent Swift/Depot-STO bug.** Today it branches only on `sheetFamily === 'third-party'`; every other family (including `'swift'` and `'depot-sto'`, not just `'vansales'`) silently falls through to Vansales's field names (`rawRow.truck`, `rawRow.total`). This has never fired because Swift never posts and Depot STO's `stock-transfer` category was out of the report's scope. The moment prerequisite fix 1 lands, Depot STO exceptions become reachable through `getDataQualityExceptions`, and this bug goes live, producing wrong "raw transporter"/"raw amount" labels for Depot STO exception rows. Fix: explicit branches for all four `TransportCostSheetFamily` values, reading each family's actual raw column names (`'swift'`: no per-row registration/transporter column, per `SWIFT_POSTING_DECISION.md` — `rawRegistration`/`rawTransporter` stay `undefined`, never fabricated; `'depot-sto'`: `DATE`/registration/transporter/amount per `DepotStoImportRow`, itself shape-varying by month, read from the already-normalized `rawRow` fields the handler stored, not a fifth guess at column names).
3. **Generalize `countPendingAmount`.** Currently hardcoded to `sheetFamily: 'third-party'` (`TransportCostSourceRecordRepository`, line 125). Widen its `sheetFamily` parameter to `TransportCostSheetFamily | TransportCostSheetFamily[]` so Slice A's "pending" banner and Slice C's missing-cost breakdown can report pending amounts across all four families, not just 3rd Party.
4. **Add the missing index** — see Section 11.

**Decision:** ship these four fixes as part of Slice A, not deferred to Slice C.
**Reason:** they are not new Slice-C work; they are existing scope boundaries in code the milestone instruction explicitly says to extend, and they become *live, wrong-output bugs* — not merely missing features — the instant Slice A widens category scope. Shipping Slice A without them means shipping a known bug on day one.
**Reversibility:** trivial — each is a small, isolated, additive diff to existing functions, no schema change.

### 6.1 Dimension aggregation

Two aggregation strategies, chosen per dimension based on where the data actually lives (verified this session, not assumed):

**Direct-field dimensions (true Mongo `$match`+`$group` pushdown, unit-testable against the existing `FakeCollection` test double as-is):**
- **Vehicle**: reuse `getNetTotalsByVehicleForCategory` unchanged, just called with the widened category array.
- **Cost Category**: new method `getNetTotalsByCategoryAcrossVehicles(costCategories, periodStart, periodEnd, context)` on `AllocationLedgerRepository` — same `$match`+`$group` shape as `getNetTotalsByVehicleForCategory`, grouped by `{costCategory, reportingCurrency}` instead of `{vehicleId, reportingCurrency}`, no `vehicleId` filter. (The existing `getNetTotalsByCategory` cannot be reused — it is deliberately scoped to one `vehicleId`, for the cost-per-km engine's per-vehicle breakdown; this is a different, tenant/org-unit-wide query.)

**Vehicle-attribute dimensions (rolled up in Node from the Vehicle aggregation above, exactly mirroring the existing `byBusinessStream` construction in `getAllocationReport`):**
- **Business Stream**: extend the existing roll-up (already built) unchanged in mechanism, now over the widened category set.
- **Transporter**: new roll-up, identical mechanism, keyed by `ContractedVehicle.transporterPartnerId` → `TransportPartner.canonicalName`, using the already-loaded `partnerById` map.

**Record-attribute dimensions (bounded raw-fetch + Node-side reduction — see 6.2 for why Mongo pushdown isn't available here):**
- **Destination**: resolved via `sourceId` → `TransportCostSourceRecord.destinationTown` (Section 16).
- **Source Family**: resolved via `sourceId` → `TransportCostSourceRecord.sheetFamily`.
- **Time series** (day/week/month/custom): bucketed from each posting's own `periodStart`.

### 6.2 Why time series, destination, and source family use bounded-fetch-then-reduce, not a Mongo `$group`

Verified this session, directly in code, not assumed: `tests/helpers/fake-collection.ts`'s `aggregate()` — the shared unit-test double every finance-repository aggregation test runs against — **only implements `$match` and `$group` stages, with `_id` as a field-path string or an object of field paths (no computed/date-truncation expressions), and only `$sum` accumulators.** Any other stage or expression "throws loudly ... rather than letting a test pass without evaluating it" (the file's own stated policy). Neither `destination`/`sheetFamily` (not fields on the posting at all — would need a `$lookup`, itself unsupported by this fake) nor month/week bucketing (`$dateTrunc`/`$year`/`$month`, also unsupported) can be expressed as a `$group` this fake evaluates.

This is not a limitation unique to `TransportCostReportService` — the generic `ReportQueryEngine`'s own `mongo-aggregation-builder.ts` has the identical restriction (`idSpec[g.field] = '$' + g.field` — flat field paths only, no computed expressions), and its own repository method for exactly this problem, `AllocationLedgerRepository.getDistinctPostedMonths`, already deliberately chose "bounded raw fetch (`findManyInScope`, capped) + reduce in Node" over a `$group`-by-month pipeline, **for this exact reason**, stated in its own doc comment.

**Decision:** extend that existing precedent rather than invent a new one. Reuse `findRawByCategoryInScope` (already bounded — `limit: 100000` — already tenant/org-unit/period/category scoped) called once with the widened category array, bulk-resolve every distinct `sourceId` via `TransportCostSourceRecordRepository.findManyByIds` (already exists, already a single batched call, no N+1), and compute destination buckets, source-family buckets, and every time-series granularity **in one pass over the same in-memory result**, in the service layer — one ledger query and one source-record query serve all three dimensions and every requested granularity, never one query per dimension and never one query per month.
**Reason:** (1) consistent with the codebase's own stated precedent and its own reasoning for choosing it; (2) satisfies the instruction's explicit "must not require one independent API call per month" requirement directly — a single bounded fetch, reduced multiple ways in Node, rather than either N monthly queries or an unsupported Mongo expression; (3) never pulls the full ledger to the browser — only the fully-aggregated JSON result crosses to the client, matching the instruction's "do not pull the entire ledger into the browser merely to calculate charts."
**Assumption:** the transport-cost subset of the ledger stays within a bound the existing `100000`-row cap safely covers for the foreseeable term. Current real scale: ~12,600 source rows across 39 sheets, Jan–Aug 2026, across ALL four families — the transport-cost-category ledger subset is smaller still. This is an explicit, load-bearing assumption, not a guarantee.
**Reversibility:** if genuine volume growth invalidates the assumption, two reversible escape hatches exist, both consistent with patterns *already present elsewhere in this codebase* rather than invented for this design: (a) copy `destinationTown`/`sheetFamily`/a precomputed `periodMonth` string onto `AllocationPosting` at post time (additive fields — mirrors how `glAccountCode` is already copied onto a posting rather than resolved via join every read), enabling true `$group` pushdown for all three; or (b) a materialized daily/monthly rollup collection maintained incrementally by `TransportCostPostingService` at post time — this exact pattern already exists in this codebase for an unrelated but structurally identical problem (`tbltelematics_daily_rollup`, registered in `module-scope.registry.ts`, "read by the reporting path... a rollup carries the orgUnitId of the readings it summarises"). Neither requires touching the ledger's append-only contract; both are additive.

### 6.3 API surface (new, `TRANSPORT_COST_VIEW`-gated, mirrors existing route-file pattern)

`GET /api/transport-cost/command-centre/summary?periodStart&periodEnd&granularity=day|week|month|custom&businessStream?&sourceFamily?` → one response containing headline total, all six dimension breakdowns, and the time-series bucket array — **one request, not one per chart**, per the instruction's explicit performance requirement.

## 7. Slice B design — drill-down to source evidence

`VehicleDrillDownDialog.tsx` (read in full) already shows, per vehicle/period: date, description, amount, reversal-or-posted badge — sourced from `getPostingsForVehicle` → `PostingDrillDown.postings: AllocationPosting[]`.

**Decision:** extend, not replace, this exact dialog and its backing `PostingDrillDown` type.
**Reason:** it already implements the correction-not-mutation display discipline (a corrected row shows as two lines, never edited in place) that any new drill-down surface would have to reimplement; the instruction explicitly says to extend, not duplicate, existing drill-down/source-record infrastructure.

**What's added per posting row:**
- **Already present, not currently rendered**: `costCategory`, `sourceCollection`, posting `_id` (the "posting ID" the instruction asks for), `currency`/`amount` (original) alongside `reportingAmount`.
- **Newly resolved, via the same `sourceId` → `TransportCostSourceRecord` join used in Slice A**: business stream (already available via the vehicle, not new), destination (where the source family/record has it — Section 16), source family, source file name, source row number, and the record's own raw fields (`registrationRaw`, `transporterRaw`, `rawDate`) — i.e., a second-level expansion ("why is this row here") reachable from the posting row, extending the existing dialog with a nested detail rather than a new page.
- **New endpoint**: `GET /api/transport-cost/command-centre/postings/:postingId/evidence` → resolves one posting's `sourceId` to its full `TransportCostSourceRecord`, `TRANSPORT_COST_VIEW`-gated, single-document lookup (no batch concern — this is a one-row, on-demand expansion, not a list).
- A new **aggregate-level drill-down** for Slice A's non-vehicle dimensions (e.g., "why is Destination = Harare Depot $X?"): reuses `findRawByCategoryInScope` + the dimension's own filter predicate (destination/family/category/stream) applied in Node to the same bounded fetch already computed for the summary, so opening a drill-down from a chart segment does not re-query the ledger — it reuses the request already made for the summary (same request/response cycle, or a short-lived server-side cache keyed by the query parameters — implementation detail decided during coding, not architecture).

## 8. Slice C design — data quality / trust panel

Existing building blocks already do most of this:
- `getDataQualityExceptions` — rejected / duplicate / period-outlier, already correctly categorized and already **not** silently assumed mutually exclusive at the code level (each category is independently computed).
- `TransportCostPostingService`'s `unresolved-vehicle-identity` skip reason (Vansales/Swift/Depot-STO-May/-June/-July, per the three decision docs) — not currently surfaced as a first-class report field; this design surfaces it.
- `countPendingAmount` (generalized per 6.0) — missing-cost counts, cross-family.

**New/derived counts** (each independently computed and independently labelled — never presented as summing to a total unless verified to be mutually exclusive):
| State | Source | Mutually exclusive with others? |
|---|---|---|
| Source records imported | `TransportCostSourceRecordRepository` count for the period/batch set | baseline |
| Posted to ledger | count of postings resolvable back to those source records | subset of imported |
| Not posted | imported minus posted | complement of posted, within imported |
| — reason: unresolved vehicle identity | posting-skip reason, read from import/posting logs or re-derived by checking which source records have no corresponding posting AND lack a normalization-review resolution | may overlap with "missing amount" for the same row — **not assumed exclusive** |
| — reason: missing amount | `countPendingAmount` per family | may overlap with unresolved-vehicle-identity |
| Duplicate | `getDataQualityExceptions().duplicates` | excluded from "imported" by construction (rejected before persisting) — see import handler |
| Rejected | `getDataQualityExceptions().rejected` | excluded from "imported" by construction, same as duplicate |
| Period anomaly | `getDataQualityExceptions().periodOutliers` | **overlapping** — a posting can be both posted AND a period outlier (it posted, just to a period outside the requested window) |

**Decision:** every count in the Slice C panel is independently computed and independently labelled as either "subset of X" or "overlapping exception flag" in its own UI copy and its own API field name — never implied mutually exclusive by table layout alone.
**Reason:** directly required by the instruction ("if categories overlap, explicitly define whether the counts are mutually exclusive OR overlapping exception flags. Do not silently imply they are mutually exclusive").
**The worked example the instruction cites (1,250 → 980 posted → 270 not posted → 120/80/40/30)** is illustrative numbers from the instruction, not this codebase's real numbers. **The real numbers must be computed from the real January 2026 (and, once available, subsequent months') data at implementation/verification time** — this design does not fabricate them, and neither will the implementation; Slice C's own verification step (Section 20) produces and reports the actual counts, following the exact reconciliation discipline already used for Vansales/Swift/Depot STO.

## 9. Required backend query changes

Summarized from Sections 6–8:
1. `AllocationLedgerRepository.getNetTotalsByCategoryAcrossVehicles` — new method, `$match`+`$group` by `{costCategory, reportingCurrency}`.
2. `AllocationLedgerRepository.findRawByCategoryInScope` — no signature change; called with the widened category array.
3. `TransportCostSourceRecordRepository.countPendingAmount` — widen `sheetFamily` parameter to accept an array.
4. `TransportCostReportService.COST_CATEGORY` → `TRANSPORT_COST_CATEGORIES` array; `extractRawDisplayFields` gets explicit `'swift'`/`'depot-sto'` branches.
5. New `TransportCostReportService` methods: `getCommandCentreSummary(context, periodStart, periodEnd, granularity)`, `getDimensionDrilldown(context, dimension, key, periodStart, periodEnd)`, `getPostingEvidence(context, postingId)`.
6. No change to `TransportCostPostingService` or the append-only ledger write path — this milestone is entirely read-side.

## 10. Required frontend changes

- New page/route (e.g. `frontend/modules/transport-cost/pages/CommandCentrePage.tsx`), reusing existing UI primitives (`Table`, `Badge`, `Dialog`, existing chart component if one is already used elsewhere in the platform — **UNVERIFIED**: which chart library is already in use must be confirmed before adding a new one, per "use existing platform visual standards").
- Extend `frontend/modules/transport-cost/types/index.ts` and `hooks/useTransportCost.ts` with the new response types and React Query hooks, following the existing `transportCostKeys` factory pattern and existing `staleTime`/`retry` conventions — no restated types, per existing convention (types re-exported from backend service files).
- Extend `VehicleDrillDownDialog.tsx` additively (new optional columns/expansion), not a new dialog component, per Section 7.
- A custom-date-range control added to the existing single-month picker on `TransportCostReportPage.tsx`'s pattern — reused, not reinvented, on the new page.

## 11. Required indexes

**New index needed**: `{tenantId: 1, costCategory: 1, periodStart: 1}` on `tblallocationledger`.
**Verified gap**: `infrastructure/database/indexes.finance-addendum.ts` (read in full) currently has `idx_allocationledger_tenant_vehicle_periodstart` (`{tenantId, vehicleId, periodStart}`) and `idx_allocationledger_tenant_glaccount_periodstart` (`{tenantId, glAccountCode, periodStart}`), but nothing keyed by `costCategory` without a `vehicleId` equality prefix. Every new Slice A query that aggregates **across all vehicles** for the transport-cost category set (`getNetTotalsByCategoryAcrossVehicles`, and the widened-category calls to `findRawByCategoryInScope`) filters by `{tenantId, costCategory: {$in:[...]}, periodStart}` with no `vehicleId` — without this index, Mongo falls back to a full tenant-scoped collection scan filtered by `$in` + range, which will not stay bounded as ledger volume grows past current scale.
No new indexes needed on `tbltransportcostsourcerecords` — its existing lookups (`findManyByIds` by `_id`, already indexed by the collection's primary key) are sufficient for the bulk-resolve pattern used throughout.

## 12. Security model

Every new endpoint gated on `Permission.TRANSPORT_COST_VIEW` — the same permission every existing transport-cost read endpoint (`getAllocationReport`, `getAvailableMonths`, `getPostingsForVehicle`, `getDataQualityExceptions`, `getSourceRecords`, all confirmed via their route files this session) already requires. **No new permission is introduced**: the Command Centre is entirely read-only over data a `TRANSPORT_COST_VIEW` holder can already see today, just aggregated and drilled-down differently.

`Permission.FINANCE_MANAGE` (confirmed this session, directly from `app/api/transport-cost/postings/route.ts`) continues to gate posting — unaffected by this milestone, which touches no write path.

Every new repository method built on `TenantScopedRepository`/`findManyInScope`/`getActiveFilter` + `tenantScopeService.buildFilter(context, 'orgUnitId')`, exactly like every existing method in `AllocationLedgerRepository` — no new authorization mechanism, no bespoke scope logic. **Authorization stays entirely server-side**: every new query built in the repository/service layer from the caller's own `TenantContext`, never from a client-supplied `orgUnitId`/"ALL VEHICLES" selection. A client-side "ALL" filter option is implemented as "send no `orgUnitId` filter param" — the server then applies the caller's own `accessibleOrgUnitIds` scope regardless of what the client asked for, identical to how `report-query.engine.ts`'s own `orgUnitPredicate` already fails closed for a scope-restricted caller with no accessible units (`{orgUnitId: {$in: []}}`, matching nothing) — this exact fail-closed shape is reused, not reinvented.

## 13. Tenant / org-unit behaviour

`tblallocationledger` is confirmed `org-unit` scoped in `module-scope.registry.ts` (`orgUnitSource: 'vehicle'`, `confirmed: true`) — every new Slice A/B aggregation and drill-down inherits this automatically by using `tenantScopeService.buildFilter(context, 'orgUnitId')`, the same call every existing ledger method already makes.

**Pre-existing open item, not introduced by this design**: the `transport-cost` module's own registry entry (covering `tbltransportcostsourcerecords`, used by Slice A's destination/source-family resolution and Slice B's evidence drill-down) is `confirmed: false` — engineering's interim reading is `orgUnitSource: 'explicit'` (the importing user's own org unit at import time), pending a still-open client confirmation on whether that's right or whether it should instead be a depot/origin named in the sheet. This design does not resolve that open question and does not need to: it reads through the existing, already-scoped `TransportCostSourceRecordRepository` exactly as `getDataQualityExceptions` already does today, so whatever the eventual resolution of that open item is, this design inherits it automatically rather than hardcoding an assumption.

Tests required (Section 20) explicitly include: same-tenant/different-org-unit (a scoped caller must not see another branch's transport-cost postings in any new aggregation or drill-down), different-tenant (must not see another tenant's data at all), and a caller with an empty `accessibleOrgUnitIds` set (must see nothing, not everything).

## 14. Data-quality model

Truth states used throughout, per the instruction's exact vocabulary — **ACTUAL** (a real posted ledger figure), **UNAVAILABLE** (the dimension does not exist for this source family — e.g. Vansales has no destination column at all), **UNATTRIBUTED** (the dimension exists in principle but could not be resolved for this row — e.g. business stream not yet confirmed by a reviewer), **RESTRICTED** (excluded by tenant/org-unit/permission scope, shown as absent rather than zero). **CALCULATED**/**ESTIMATED** are not used anywhere in this milestone — every number here is either **ACTUAL** (from the ledger) or explicitly one of the non-numeric absence states; nothing here is a derived estimate. No missing value is ever rendered as `0`, `$0`, `"Unknown Truck"`, or any other fabricated placeholder — every UI surface added in this milestone renders one of the explicit absence-state labels instead, per the instruction's explicit examples.

## 15. Time-period semantics

Reused unchanged from the existing, already-correct per-family semantics (documented in each family's decision doc, not reinterpreted here):
- **3rd Party / Swift**: per-row transaction/delivery date, used as both `periodStart` and `periodEnd`.
- **Vansales**: declared calendar month (`periodMonth`), never a per-row date — `VANSALES_PERIODIZATION_DECISION.md`'s Option A, unchanged.
- **Depot STO**: `DATE` as supplied, used as-is for both `periodStart`/`periodEnd` — a dated stock movement, never a declared-month retainer.

Custom range support (Slice A) is additive to the existing single-month picker — it changes the *width* of `[periodStart, periodEnd]` passed into the same `buildPeriodFilter`/fully-contained rule already used everywhere; it does not change what a period means for any family. Day/week bucketing (new, for the time-series chart) buckets each already-correctly-dated posting by its own `periodStart` — a Vansales posting still buckets into its declared month (its `periodStart` already equals the first of that month, per the existing periodization decision), never re-dated to look daily.

## 16. Destination strategy

**Decision: Option B — resolve `destinationTown` at reporting time via `sourceId` → `TransportCostSourceRecord`, no ledger schema change.**
**Reason:** `AllocationPosting` has no `destination` field today. Adding one (Option A) would be altering the append-only ledger's contract for a field that already exists, unmodified, on the source record it can be joined to — exactly the case the instruction's STOP-before-implementation clause is warning against ("do NOT change the ledger schema merely for convenience"). The join is the same `sourceId → TransportCostSourceRecordRepository.findManyByIds` pattern `getDataQualityExceptions` already uses in production today, so this introduces no new join mechanism.
**Assumption, UNVERIFIED — must be confirmed before implementation, not asserted here:** which source families actually populate `destinationTown` on their real rows. What is confirmed from `DEPOT_STO_DECISION.md`: March/April Depot STO shares 3rd Party's exact 8-column shape, **including** `Destination Town` — May/June/July/August Depot STO's shapes do **not** have a destination column at all (per the four-shapes table in that document). 3rd Party's own destination population is not re-verified in this design session (it was established in an earlier phase). Vansales's and Swift's real per-row destination population is **not verified in this design phase** — before any UI copy asserts "Vansales has no destination data" or similar, that must be checked against the real workbook the same way the Depot STO vehicle-identity population table was checked (counting real populated cells, not just checking column presence), per the exact discipline that caught that earlier mistake before delivery.
**Consequence for the model:** a source family/period with no destination column at all reports **UNAVAILABLE** for that dimension (the column doesn't exist); a source family that has the column but a specific row left it blank reports **UNATTRIBUTED** for that row only — the two are never merged into one bucket, matching the instruction's May/June/July Depot-STO-vehicle-identity distinction pattern extended to this dimension.
**Reversibility:** if destination volume/usage later justifies copying it onto the posting for performance, that is an additive field, non-breaking, and does not require touching historical postings (they simply lack the field and continue resolving via the join as a fallback).

## 17. Business-stream strategy

`ContractedVehicle.businessStream: BusinessStream` is a **closed TypeScript union**: `'olivine' | 'hypery' | 'surface-wilmar'` (confirmed this session, `shared/types/contracted-vehicle.types.ts`, read in full). The Command Centre shows exactly these three plus **Unattributed** (vehicles with no `businessStream` set — the honest majority for January 2026 data per the existing report service's own header comment) — never a fourth, invented stream, and never inferred from fuzzy vehicle/customer-name matching, per the instruction's explicit prohibition. If Olivine's real data ever surfaces a genuinely new stream, that is a type-level change (`BusinessStream` union) and a normalization-rule change, not a reporting-layer query change — flagged here as a constraint on this design, not solved by it.

## 18. Drill-down strategy

Three levels, all built on already-existing infrastructure, extended (Section 7): dimension summary (Slice A) → per-vehicle or per-dimension-bucket postings list (extends `getPostingsForVehicle`/`VehicleDrillDownDialog.tsx`, plus a new dimension-bucket variant) → per-posting source evidence (new, single-document `sourceId` resolve). No new drill-down mechanism is introduced; the existing "posting → source record" join is reused at every level.

## 19. Performance strategy

- Every dimension aggregation either a real Mongo `$match`+`$group` (vehicle, category, and their Node-side roll-ups: stream, transporter) or one bounded (`limit: 100000`, matching existing precedent), tenant/org-unit/period/category-scoped raw fetch reused across destination/source-family/time-series (Section 6.2) — never an unbounded query, never the full ledger pulled to the browser.
- No N+1: every source-record resolution goes through the existing batched `findManyByIds`; every vehicle/partner resolution goes through the existing batched pattern already in `getAllocationReport` (load all vehicles once, all needed partners once, build `Map`s, join in Node).
- One summary endpoint serves the whole first screen (Section 6.3) — not one call per chart, not one call per month, per the instruction's explicit requirement.
- New index (Section 11) added before Slice A ships, not after.
- **Benchmark requirement (per the instruction, not yet executed — implementation task)**: run the new `getCommandCentreSummary` path against the real ~12,600-row January–August 2026 dataset and record actual latency before declaring Slice A done; if it is not acceptable, the reversible escape hatches in Section 6.2 are the documented next step, not an ad-hoc fix.

## 20. Test strategy

Following the existing project convention (unit tests against `FakeCollection`, security tests for tenancy, a `verify-phase-*.ts`-style script against the real workbook for end-to-end reconciliation):
- Aggregation correctness per dimension (stream/vehicle/transporter/destination/category/source-family), including mixed-currency handling (never silently summed).
- Time-series bucketing correctness: day/week/month/custom, including a period-boundary posting (fully-contained rule respected, not reinterpreted).
- Missing-dimension handling: a row with no destination, no business stream, no resolvable vehicle — each renders its correct absence state (Section 14), never `0` or a fabricated label.
- Unattributed/unposted/duplicate/rejected/period-anomaly record handling, including the overlapping-vs-exclusive assertions from Section 8's table, tested directly (not just eyeballed).
- Tenant isolation, org-unit isolation (same-tenant-different-unit, different-tenant, empty-accessible-units), permission enforcement (`TRANSPORT_COST_VIEW` required, `FINANCE_MANAGE` unaffected) — same pattern as `tests/security/transport-cost-indexes.spec.ts` and the existing report-service spec's coverage.
- No-N+1: assert bulk-resolve call counts stay constant regardless of row count (a common pattern already used elsewhere in this codebase's test suite for this exact concern).
- Empty/unavailable states: a period with zero postings, a source family with a structurally absent dimension.
- Source-record lineage: a posting's drill-down resolves to the exact original row (sheet, row number, raw values) it was posted from.
- **Real reconciliation**: extend `scripts/verify-phase-o3-o4.ts` (or a new `scripts/verify-command-centre.ts` following its exact pattern) to assert Command Centre summary totals equal `AllocationLedgerRepository`'s existing totals for the same period/category set — Section 22 below.

## 21. Migration requirements

**None required for this design as specified** (Decision B for destination, no new posting-time fields, no schema change). If a future volume-driven pivot to the Section 6.2 escape hatches is taken, that would need: (a) a backfill script computing `destinationTown`/`sheetFamily`/`periodMonth` for historical postings from their existing `sourceId` join (a one-time, reversible, read-derived backfill, not a data change to the ledger's financial facts), or (b) an initial-build script for a new rollup collection. Neither is needed to ship this milestone.

## 22. Assumptions and provisional decisions (summary — see inline Decision/Reason/Assumption/Reversibility blocks above for full reasoning)

1. Command Centre extends `TransportCostReportService`/`AllocationLedgerRepository`, not `ReportQueryEngine`/`DataSourceRegistry` (Section 2).
2. Destination resolved via `sourceId` join, no ledger schema change (Section 16) — **and its real per-family population is unverified pending empirical check**, flagged explicitly rather than assumed.
3. Time-series/destination/source-family use bounded-fetch-then-Node-reduce, following the existing `getDistinctPostedMonths` precedent, not a Mongo date-group (Section 6.2), with two named, codebase-precedented reversible escape hatches if volume grows.
4. The four prerequisite fixes (category-scope widening, `extractRawDisplayFields`, `countPendingAmount`, new index) ship as part of Slice A, not deferred (Section 6.0, Section 25).
5. No new permission introduced; every new endpoint reuses `TRANSPORT_COST_VIEW` (Section 12).
6. Business stream stays the closed three-value union plus Unattributed; no fuzzy inference (Section 17).
7. The Slice C worked-example numbers in the milestone instruction are illustrative, not this codebase's real numbers — real counts are computed and reported at Slice C verification time (Section 8).

## 23. Decision / Reason / Assumption / Reversibility register

All entries below are also inline at their point of relevance (Sections 2, 6.0, 6.2, 8, 16); collected here for a single point of review as the instruction requests.

| # | Decision | Reason | Assumption | Reversibility |
|---|---|---|---|---|
| 1 | Build on `TransportCostReportService`, not `ReportQueryEngine` | Purpose-built, correct permission, already has the needed precedents; avoids a second parallel reporting path over the same ledger | A future ad-hoc pivot need is legitimately `ReportQueryEngine`'s job, not this milestone's | Fully independent — adding fields to `allocationsDataSource` later has no dependency on this work |
| 2 | Destination resolved via `sourceId` join (Option B) | No ledger schema change; reuses existing join pattern | Per-family destination population is unverified — flagged, not assumed | Additive posting field later, non-breaking, existing rows unaffected |
| 3 | Time-series/destination/source-family: bounded fetch + Node reduce | Matches existing codebase precedent and its stated reasoning (`FakeCollection` limits); satisfies "no one-call-per-month" | Transport-cost ledger subset stays within existing `100000`-row cap for the foreseeable term | Two named, codebase-precedented escape hatches (posting-time field copy; rollup collection like `tbltelematics_daily_rollup`) |
| 4 | Four prerequisite fixes ship inside Slice A | They become live bugs, not just gaps, the moment category scope widens | None beyond normal regression risk of any small fix | Each fix is isolated and additive |
| 5 | No new permission; reuse `TRANSPORT_COST_VIEW` | Command Centre is read-only over already-visible data | Matches existing permission model's intent | Trivial to add a narrower permission later if product wants one |
| 6 | Business stream: closed union + Unattributed only | Instruction explicitly forbids inventing streams or fuzzy inference | Olivine's real streams stay within the current three for this milestone's timeframe | A new stream is a deliberate type-level change, tracked as future work, not silently absorbed |

## 24. Explicitly unsupported metrics (unchanged from the milestone instruction, restated for completeness)

Cost/km, fuel consumption, litres, km/L, fuel variance, vehicle efficiency, AI predictions, fuel fraud detection, route profitability, predictive savings, automated recommendations. None of these are introduced anywhere in this design. The existing `3.15 km/L` figure remains reference-only, untouched.

## 25. Recommended implementation order

Revised from the instruction's suggested A → B → C, with reasoning:

**A0 (prerequisite fixes, Section 6.0) → A (aggregation + time series) → B (drill-down enrichment) → C (data quality / trust panel).**

**Decision:** insert A0 explicitly before A, and confirm B before C (matching the instruction's own suggested order, not reordered) rather than doing all four fixes as an undifferentiated part of "Slice A."
**Reason:** A0's four fixes are dependency-forcing — Slice A cannot widen category scope without them going live safely, and Slice C's data-quality panel is *more* correct, not less, once A0's `countPendingAmount` generalization and `extractRawDisplayFields` fix already exist (Slice C reuses both directly rather than needing its own, possibly divergent, fix). B is kept before C because a manager understanding a data-quality exception ("why isn't this posted") benefits from already having drill-down infrastructure in place to show exactly which source row triggered it — Slice C's exception rows are themselves a form of drill-down target.
**Each slice is independently verified** (own tests, own reconciliation-to-ledger check, own tsc/lint/build pass, own delivery report) before the next begins, per the instruction — a slice is not "started" until the previous one's verification step has produced real, reported numbers, not just passing tests.

---

## Final engineering question (to be answered again, with evidence, at the end of implementation — not answered here)

This document is scope and design only. The instruction's closing question — can an Olivine transport manager seeing this screen for the first time understand where money is going, what drives cost, which numbers need attention, and trace any important number back to source evidence — is explicitly **not yet answered** here, because no code exists yet to evaluate. It will be answered, with evidence (real reconciliation numbers, real screenshots or described UI states, and an explicit list of anything still missing if the answer is not fully yes) at the end of Slice C, following the same delivery-report discipline already used for Vansales, Swift, and Depot STO.
