# CHANGELOG — Olivine Live Operating Model, Slice 2 (Multi-Line Transport Operations)

**Date:** 24 September 2026
**Trigger:** client's explicit Slice 2 specification ("ELITE EXECUTION — OLIVINE LIVE OPERATING MODEL — SLICE 2: MULTI-LINE TRANSPORT OPERATIONS"), accepting Slice 1's delivery and building on it without redesigning or resetting it.
**Full analysis:** see `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` Section 5 (rewritten in place for this slice) for the complete design record — decisions, reasoning, assumptions, and reversibility for every choice made in this delivery. See `CHANGELOG-olivine-live-operating-model.md` for Slice 1.

## Summary

A `TransportCostSourceRecord` (one transport OPERATION — one truck, one transporter, one date, one cost) now supports multiple child load/consignment LINES (one invoice, customer, consignment, destination, and tonnage per line), for 3rd Party manual entry. This matches Olivine's real operations: one truck trip can carry more than one invoice. The parent-level cost is never multiplied by the number of lines — a $1,000 operation with 3 lines is still exactly $1,000, never $3,000, guaranteed structurally (the amount/period computation in `TransportCostPostingService` was not touched by this slice at all) and proven by dedicated tests. Every existing single-line record and every existing report/aggregation continues to work unchanged; the child `lines` array is purely additive.

Also closed, at the client's explicit request: `AllocationService.reversePosting()` now carries `costFacingCompany` forward onto a reversal posting — a gap Slice 1 disclosed and deliberately deferred as low-risk. Confirmed safe and fixed in this pass, with regression tests proving every other cost category is unaffected.

**No destructive database operation of any kind was performed or written. No historical data was touched, migrated, or deleted. This is a pure additive change**, following the same discipline as Slice 1.

## New files

- `tests/unit/transport-cost/import-transport-cost.handler.multiline.spec.ts` — 13 tests: backward-compatible mirroring for all four sheet families, explicit multi-line acceptance/rejection/renumbering for 3rd Party, and the financial rule (one posting-eligible record, one unchanged `amount`, no cost field anywhere on a line, regardless of line count).
- `tests/unit/transport-cost/transport-cost-source-record-load-summary.repository.spec.ts` — 7 tests for `getLoadSummaryInScope`: operation/line/multi-line counting, period filtering, tenant scoping, org-unit scoping, and sheet-family widening.
- `CHANGELOG-olivine-live-operating-model-slice-2.md` — this file.

## Changed files

**Backend — data model and import:**
- `shared/types/transport-cost.types.ts` — new `TransportCostLine` type (lineNumber, salesInvoiceNo, customerName, consignmentNumber, destinationTown, tonnageRaw — deliberately no cost/amount field); new `lines?: TransportCostLine[]` field on `TransportCostSourceRecord` (undefined only for historical pre-Slice-2 rows; every row from this slice onward gets at least one line).
- `modules/transport-cost/commands/import-transport-cost.command.ts` — new `RawTransportCostLineInput` interface; new `lines?: RawTransportCostLineInput[]` on `ThirdPartyImportRow` only (Vansales/Swift/Depot STO import row shapes unchanged).
- `modules/transport-cost/commands/handlers/import-transport-cost.handler.ts` — new `buildLine`/`isBlankLine`/`resolveLines` private helpers, shared by all four `validateAndBuildX` methods so every row (old shape or new) gets a well-defined `lines[]` and its scalar fields are populated from `lines[0]` (never disagreeing with it). Only 3rd Party accepts an explicit `lines` array; bulk file import is completely unchanged for all four families — no new grouping convention was invented for uploaded spreadsheet rows (see the gap analysis for why).

**Backend — ledger and reporting:**
- `modules/transport-cost/services/transport-cost-posting.service.ts` — `describePosting` appends a `[+N more loads]` suffix when a posting's source record has more than one line. `resolveAmountAndPeriod` (the actual money/period computation) was **not modified**, which is the structural guarantee a multi-line record can never post more than one amount.
- `modules/transport-cost/repositories/transport-cost-source-record.repository.ts` — new `getLoadSummaryInScope()` method: a pure operational read (`{ totalOperations, totalLines, multiLineOperationCount }`), tenant- and org-unit-scoped, period-filtered, sheet-family-scoped (defaults to third-party).
- `modules/transport-cost/services/transport-cost-report.service.ts` — new `loadSummary` field on `TransportCostAllocationReport`, sourced from `getLoadSummaryInScope`; deliberately kept separate from `byCompany`/`byVehicle`/`byBusinessStream` and never summed into their financial totals.

**Backend — the disclosed Slice 1 follow-up:**
- `modules/finance/services/allocation.service.ts` — `reversePosting()` now copies `costFacingCompany` from the original posting onto the reversal, exactly like every other field it already copies (currency, glAccountCode, fxRate, ...). Optional-field copy, a no-op for every cost category other than the three transport-cost ones.
- `modules/transport-cost/services/transport-cost-posting.service.ts` — the code comment documenting this as a known/accepted limitation was updated to record that it is now resolved.

**Frontend:**
- `frontend/modules/transport-cost/types/index.ts` — re-exports `TransportCostLine`.
- `frontend/shared/import/ManualEntryModal.tsx` — new optional `lineColumns`/`lineSectionLabel` props: a repeatable "Load / Consignment Lines" section with an "Add another line" control. A `FieldInput` helper component was factored out of the existing per-column-type rendering so the parent-field grid and each line's grid render identically. Byte-for-byte unchanged behavior for every caller that does not pass `lineColumns` (every sheet family except 3rd Party's manual-entry modal).
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — `THIRD_PARTY_COLUMNS` (the bulk-upload column set) is **untouched**. New `THIRD_PARTY_PARENT_COLUMNS`/`THIRD_PARTY_LINE_COLUMNS` feed the 3rd Party manual-entry modal only. The source-records table gained a "Loads" column (silent for an ordinary single-load row, a badge for a genuine multi-load operation).
- `frontend/modules/transport-cost/pages/TransportCostReportPage.tsx` — new "3rd Party transport operations vs. loads" section, sourced from `report.loadSummary`, explicitly separate from the financial company/stream/vehicle sections (satisfies the client's "TRANSPORT OPERATIONS vs TRANSPORT LINES/LOADS, shown separately" requirement).

**Documentation:**
- `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` — Section 5 rewritten from "ANALYZED, DESIGNED, NOT YET BUILT" to "SHIPPED", recording what was actually built plus every DECISION/REASONING/ASSUMPTION/REVERSIBILITY note; Section 4's disclosed limitation marked resolved; Sections 1, 2, 7, 12, 15 updated to reflect Slice 2's completion.

## Backward compatibility

- Every existing scalar field (`customerName`, `salesInvoiceNo`, `destinationTown`, `tonnageRaw`) remains on `TransportCostSourceRecord`, permanently populated as the "line 1 mirror" — no consumer reading those fields directly needs to change, and none was changed.
- A historical row imported before this slice has `lines: undefined`; every consumer treats that identically to a single-line row (`lines?.length ?? 1`).
- No comma-separated fields were introduced anywhere. No parent record is ever duplicated to represent additional lines.
- Bulk file import — the far more common import path — is unchanged in every respect (columns, template, validation, behavior) for all four sheet families.

## Financial-integrity guarantee (structural, not just tested)

`TransportCostPostingService.postSourceRecord` posts exactly one `AllocationPosting` per one `TransportCostSourceRecord`, regardless of line count — this was true before this slice and remains true because `resolveAmountAndPeriod` was not touched. A 3-line, $1,000 operation posts one $1,000 entry, never $3,000. Proven by `import-transport-cost.handler.multiline.spec.ts`'s dedicated financial-rule tests: no `amount`/`cost` property exists anywhere on a `TransportCostLine`, and a record's own `amount` field is provably unchanged by adding lines to it.

## Verification performed

- `npx tsc --noEmit` — clean, no errors (confirmed twice: once after the backend changes, once after the frontend changes).
- `npx jest` (full suite) — **3176 passed, 21 skipped (pre-existing: the same live-MongoDB-only integration suite Slice 1 also reported), 0 failed**, across 178 of 179 test suites (1 suite entirely skipped for the same MongoDB-availability reason).
- Specifically re-ran and confirmed green: `import-transport-cost.handler.spec.ts` (54 pre-existing tests, zero regressions from the `resolveLines` rewiring), `import-transport-cost.handler.multiline.spec.ts` (13 new), `transport-cost-source-record-load-summary.repository.spec.ts` (7 new), `transport-cost-posting.service.spec.ts` (30 tests, including 3 new reversal/`costFacingCompany` regression tests), `transport-cost-report.service.spec.ts` (10 tests, including the `loadSummary` wiring), the full `tests/security` directory (unaffected — tenancy/RBAC/append-only guarantees untouched by this slice).
- `npx eslint` on all touched/new files — zero new violations in production code; the pre-existing `@typescript-eslint/no-explicit-any`/`no-require-imports` findings in new test files match this codebase's established test-file convention exactly (confirmed by lint-checking untouched pre-existing spec files in the same directories, which show the identical pattern), not a regression introduced by this pass.
- `npx next build` (production build) — **blocked by this environment's lack of network access to Google Fonts** (`next/font` cannot fetch Geist/Geist Mono from fonts.googleapis.com), not by anything in this delivery's code. Reported honestly per the client's explicit instruction not to claim build success if the environment blocks it; `tsc --noEmit` and the full `jest` suite are the verification available in this environment.

## What this delivery does NOT include

- Bulk-file-upload multi-line support, for any sheet family — deliberately not built; no reliable signal exists in the real source files to group rows into one operation without guessing (see the gap analysis, Section 5, "Bulk-import DECISION").
- Multi-line support for Vansales, Swift, or Depot STO — deliberately not built; no demonstrated business need in the real data inspected this pass (see the gap analysis, Section 5, "Family-scope DECISION").
- Master-data search/"+ Add New" fields (gap analysis Section 6) — explicitly out of scope for this pass per the client's own instruction, remains the next separate slice.
- Everything else the Slice 1 gap analysis already listed as not yet built (inline table CRUD, the broader dashboard/chart set, production cutover execution) — unchanged by this slice; see `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` Sections 6–11 and 13.
