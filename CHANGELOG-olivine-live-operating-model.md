# CHANGELOG — Olivine Live Operating Model, Slice 1 (Cost-Facing Company)

**Date:** 24 September 2026
**Trigger:** client meeting requirements document ("OLIVINE — NEW BUSINESS REQUIREMENTS FROM CLIENT MEETING / LIVE OPERATING MODEL STARTS 1 OCTOBER 2026").
**Full analysis:** see `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` for the complete 15-section gap analysis this delivery was scoped against, including what remains for future passes.

## Summary

Implemented and fully verified the highest-priority, most explicitly specified requirement from the client meeting: every transport cost is now captured against one of exactly three cost-facing companies (**Hypery / Olivine / Surface**), as structured, validated, required data, flowing end-to-end from entry form through to the reporting dashboard.

**No destructive database operation of any kind was performed or written.** Historical data is untouched. This is a pure additive change.

## New files

- `shared/types/cost-facing-company.types.ts` — `CostFacingCompany` union, canonical option list, `normalizeCostFacingCompany()`, `costFacingCompanyLabel()`.
- `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` — the client's explicitly requested gap-analysis deliverable.
- `tests/unit/transport-cost/allocation-ledger-company-totals.repository.spec.ts` — 8 new tests for the new ledger aggregation.

## Changed files

- `shared/types/transport-cost.types.ts` — added `costFacingCompany` to `TransportCostSourceRecord`.
- `modules/transport-cost/commands/import-transport-cost.command.ts` — added `costFacingCompany` to all four import row interfaces.
- `modules/transport-cost/commands/handlers/import-transport-cost.handler.ts` — new `resolveCostFacingCompany()` validation, wired into all four `validateAndBuildX` methods (required, rejected with a clear error if missing/invalid, logged to the existing data-quality exception path).
- `modules/finance/types/allocation.types.ts` — added `costFacingCompany` to `AllocationPosting`.
- `modules/transport-cost/services/transport-cost-posting.service.ts` — copies `costFacingCompany` from the source record onto the ledger posting at post time (disclosed limitation: `reversePosting()` does not yet carry it forward on a reversal — see the gap analysis, Section 4).
- `modules/finance/repositories/allocation-ledger.repository.ts` — new `getNetTotalsByCompanyAcrossVehicles()` aggregation.
- `infrastructure/database/indexes.finance-addendum.ts` — new sparse index for the company aggregation, **plus a fix for a pre-existing gap** found during this pass's verification: a `{tenantId, costCategory, periodStart}` index that an earlier session's test suite already asserted but that had never actually been added.
- `modules/transport-cost/services/transport-cost-report.service.ts` — new `byCompany: CompanyGroupTotal[]` field on `TransportCostAllocationReport`.
- `frontend/modules/transport-cost/types/index.ts` — re-exports for the new types.
- `frontend/shared/import/ImportModal.tsx` — new `'select'` column type and `ImportColumnOption`.
- `frontend/shared/import/ManualEntryModal.tsx` — renders a proper dropdown for `'select'`-type columns.
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — added the required company column to all four sheet families.
- `frontend/modules/transport-cost/pages/TransportCostReportPage.tsx` — new "By cost-facing company" card section.
- `tests/unit/transport-cost/import-transport-cost.handler.spec.ts` — all four row-builder fixtures updated to include a valid `costFacingCompany` (the field is now required, so every pre-existing test fixture needed this to keep constructing a valid row — none of the pre-existing tests' own assertions were changed); 8 new tests added specifically for the company-dimension validation.

## Verification performed

- `npx tsc --noEmit` — clean, no errors.
- `npx jest` (full suite) — **3153 passed, 21 skipped (pre-existing: an integration suite requiring a live MongoDB instance, not available in this environment), 0 failed**, across 177 test suites (176 run, 1 skipped for the same reason).
- `npx eslint` on all touched files — no new violations; the pre-existing `@typescript-eslint/no-explicit-any` findings are consistent with this codebase's established baseline in the same files (e.g. every other aggregation method in `allocation-ledger.repository.ts` uses the identical `.map((row: any) => ...)` pattern) and are not a regression introduced by this pass.
- Specifically re-ran and confirmed green: `import-transport-cost.handler.spec.ts` (54 tests), `allocation-ledger-append-only.spec.ts` (append-only/reversal/scoping guarantees, unaffected), `allocation-ledger-company-totals.repository.spec.ts` (new, 8 tests), `finance-indexes.spec.ts` (fixed).

## What this delivery does NOT include

See `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` Sections 5–11 for the full, honest accounting of what remains: multi-line transport records, master-data search fields, inline table CRUD, the broader dashboard/chart set, and the (deliberately non-executed) production cutover plan.
