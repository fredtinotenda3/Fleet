# Cost Intelligence Command Centre — implementation progress

Tracks implementation against `OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md`, the same way `OLIVINE_PHASE_PLAN.md` tracks the O-series. Kept as a separate document rather than folded into the O-series plan: the O-series (O1–O5) is fully shipped and closed; this is a new, still-in-progress milestone built on top of it.

| Slice | Scope | Status |
|---|---|---|
| **Design** | `OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md`, all 25 required sections, grounded in the actual codebase (verified `DataSourceRegistry`/`ReportQueryEngine` are real but a separate system; verified the `FakeCollection` `$group` limitation that shapes the time-series/destination architecture; verified `module-scope.registry.ts`'s tenancy declarations). | **Shipped.** |
| **A0** | Prerequisite fixes, identified during design as becoming live bugs the moment Slice A widens cost-category scope: (1) `extractRawDisplayFields` fixed for all four sheet families, not just `'third-party'`/`'vansales'`; (2) `TransportCostSourceRecordRepository.countPendingAmount` generalized to accept any `TransportCostSheetFamily` or array, including a correct Vansales declared-month handling path; (3) `TRANSPORT_COST_CATEGORIES` constant added alongside (not replacing) the existing `COST_CATEGORY`, so the O4 report screen's numbers are unaffected; (4) new `{tenantId, costCategory, periodStart}` index added to `FINANCE_INDEXES`. | **Shipped, tested, verified this delivery — see below.** |
| **A** | Cost aggregation + time series (dimension breakdowns, custom ranges, single bounded query per load). | Not started. |
| **B** | Drill-down to source evidence (extends `VehicleDrillDownDialog.tsx`/`PostingDrillDown`). | Not started. |
| **C** | Data quality / trust panel. | Not started. |

## A0 — what shipped and how it was verified

**Files changed:**
- `modules/transport-cost/repositories/transport-cost-source-record.repository.ts` — `countPendingAmount` widened (default behaviour unchanged; new optional `sheetFamily` param, single value or array; Vansales handled via a bounded fetch + Node-side `parsePeriodMonth` check rather than a dotted-path Mongo filter — see the method's own doc comment for why).
- `modules/transport-cost/services/transport-cost-report.service.ts` — `extractRawDisplayFields` given explicit `'swift'`/`'depot-sto'` branches (previously both silently fell through to Vansales's field names); `TRANSPORT_COST_CATEGORIES` constant added; `AllocationCostCategory` added to the existing type-only import.
- `infrastructure/database/indexes.finance-addendum.ts` — new `idx_allocationledger_tenant_costcategory_periodstart` index on `tblallocationledger`.
- `tests/unit/transport-cost/transport-cost-source-record.repository.spec.ts` — **new file**, 7 tests: default-unchanged behaviour, multi-family counting, dated-family period exclusion, Vansales in-period/out-of-period/unparseable-periodMonth handling, and a combined dated+Vansales call.
- `tests/unit/transport-cost/transport-cost-report.service.spec.ts` — 2 new tests pinning the Swift and Depot STO `extractRawDisplayFields` fixes via `getDataQualityExceptions`, with rawRow field names read directly from `SwiftImportRow`/`DepotStoImportRow`.
- `tests/security/finance-indexes.spec.ts` — 1 new test pinning the new index's exact key shape.

**Verification performed, with real evidence, not just "tests exist":**
- `npx jest transport-cost finance --silent` → **13 suites, 180 tests, all passing** (0 failures) immediately before delivery.
- `npx tsc --noEmit` → **clean, zero errors**, full project.
- Full project suite (`npx jest`) → **178 of 179 suites passing (1 pre-existing skip, unrelated to this change), 3,163 of 3,184 tests passing (21 pre-existing skips), 0 failures.** Baseline before this delivery was 3,153/3,174 passing (per `PHASE_O2_O3_O4_SUMMARY.md`'s own recorded baseline) — the +10 net passing count is exactly the 10 new tests added in this slice (7 + 2 + 1), confirming no pre-existing test was broken and nothing was silently skipped.
- A genuine bug was found and fixed DURING this verification, not assumed away: the first draft of the new Vansales `countPendingAmount` tests failed (0 actual vs 1 expected) because this environment's timezone (`TZ=Africa/Harare`, UTC+2 — deliberately matching Olivine's own timezone, not a CI artifact) meant a UTC-ISO-constructed test boundary disagreed with `parsePeriodMonth`'s local-time month-boundary convention (documented in that function's own doc comment: "Both boundaries are local-midnight Date values ... so a Vansales posting's periodStart/periodEnd compare consistently with every other posting in the ledger"). The test's date construction was corrected to match the codebase's own established local-time convention; the repository code itself needed no change. This is flagged, not hidden, because it is a reminder that any FUTURE Command Centre code comparing a Vansales-derived period boundary against a caller-supplied one must use the same local-time convention `parsePeriodMonth`/`parseSourceDate` already establish, not a UTC-ISO one — worth re-checking explicitly when Slice A's time-series bucketing is implemented.

**What is deliberately NOT yet true:** the O4 report screen (`TransportCostReportPage.tsx`) is completely unaffected by this delivery — its numbers, its single-category scope, and its behaviour are byte-for-byte unchanged, because `COST_CATEGORY` was left in place rather than replaced. No new user-facing surface exists yet. `TRANSPORT_COST_CATEGORIES` and the widened `countPendingAmount`/fixed `extractRawDisplayFields` exist and are tested in isolation, but nothing in the product calls them with more than one category yet — that begins with Slice A.

## Next step

Slice A: `getNetTotalsByCategoryAcrossVehicles` (new repository method), the Business-Stream/Transporter Node-side roll-ups extended to the widened category set, the bounded-fetch-then-reduce path for destination/source-family/time-series (Section 6.2 of the design doc), the new `getCommandCentreSummary` service method, its route, and its frontend page — each with its own test coverage and its own reconciliation-to-ledger check before being declared done, per the same discipline used here.
