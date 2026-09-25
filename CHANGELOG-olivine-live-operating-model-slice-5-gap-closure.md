# Olivine Live Operating Model -- Slice 5 Gap Closure

**Status:** Complete. All five objectives implemented, tested, and verified.
**Scope:** Exactly the five objectives below. No Slice 6 work, no October 1
cutover, no database reset/archive, no unrelated feature work, no
architectural redesign.

This pass closes five specific, previously-documented gaps in the Slice 5
"Live Operating Model" implementation for transport cost operations. Every
change reuses existing architecture (repositories, CQRS commands, the
existing master-data infrastructure, the existing audit-log convention) --
nothing here introduces a second reporting engine, a duplicate master-data
system, or a new persistence layer.

---

## Objective 1 -- Operation detail page: audit history

**Gap:** `TransportCostRecordCommandService` had no method exposing an
operation's audit trail, and the class's `getAuditHistory`-adjacent code
path (once added) bypassed the class's own constructor-injection
convention by importing the `auditLogRepository` singleton directly --
making it untestable against the class's existing `FakeCollection` test
harness.

**What changed:**
- `modules/transport-cost/services/transport-cost-record-command.service.ts`
  -- `AuditLogRepository` is now a 6th constructor parameter, defaulting to
  the production singleton (matching every other dependency in this
  class). `getAuditHistory` now calls `this.auditLogRepo.findWithFilters(...)`
  instead of the module-level singleton directly.
- Route: `app/api/transport-cost/source-records/[id]/audit/route.ts` --
  `TRANSPORT_COST_VIEW`-gated, tenant/org-unit-scoped, chronological
  (newest first), paginated.
- Frontend: `AuditHistorySection.tsx`, wired into
  `TransportOperationDetailPage.tsx` (graceful empty and error states).

**Tests:** `tests/unit/transport-cost/transport-cost-record-command.service.spec.ts`
(`describe('Audit history', ...)`, 7 tests) -- correct-operation-only,
unrelated-operation excluded, empty-honest-result (never fabricated),
cross-tenant blocked (404), org-unit-scoped blocked (404), tenantId
scoping even on entityId collision, newest-first pagination. Route
reachability pinned in `tests/security/gap-closure-routes-reachable.spec.ts`.

---

## Objective 2 -- Complete Edit/Correct frontend

**Gap:** The Edit/Correct dialog did not expose every operation-level field
the backend already supported, and multi-line (`TransportCostLine[]`)
editing had no UI at all.

**What changed:**
- `frontend/modules/transport-cost/components/EditRecordDialog.tsx` --
  financial-field section now renders whenever those fields are actually
  editable (`mode === 'correct' || (mode === 'edit' && !isPosted)`),
  matching the backend's own rule exactly. `customerName`/`destinationTown`
  now use the existing `SearchCreateSelect` master-data component instead
  of free text. `transporterPartnerId`/`contractedVehicleId` use the
  existing `IdentityPicker` with an inline "Request new" action.
  Confirmation copy makes the financial-reversal consequence of Correct
  explicit (reverse + repost, net effect is the corrected total, not the
  sum of both).
- **This pass's specific addition:** a `lines[]` editing table --
  add/remove/reorder rows, each row editable for
  `customerName`/`destinationTown`/`salesInvoiceNo`/`consignmentNumber`/
  `tonnageRaw` (the full `TransportCostLine` field set; there is no
  "actual weight" field anywhere in this schema -- `tonnageRaw` is the
  only tonnage figure a line carries, so none was invented). Rendered only
  when `record.lines` is populated (an `Array.isArray` check) -- a legacy
  pre-Slice-2 record with no `lines` array at all keeps the original
  single-row scalar inputs, per that field's own documented invariant
  ("undefined means imported before this field existed -- never
  backfilled retroactively").

  **Invariant preserved:** `TransportCostSourceRecord.lines[0]` is
  documented as the *same data* as the record's own flat
  `customerName`/`destinationTown`/`salesInvoiceNo`/`tonnageRaw` fields,
  not an independent copy. Neither `TransportCostRecordCommandService
  .editSourceRecord` nor the repository's `conditionalUpdate` derive one
  from the other -- both apply a patch verbatim. So whenever the lines
  table produces a changed `lines` array, `EditRecordDialog`'s
  `handleSubmit` also patches the four flat fields from the new
  `lines[0]`, in the same submission, keeping them in lock-step. This is
  pinned by a dedicated backend test proving the service does *not*
  auto-sync these fields on its own (making the frontend's responsibility
  explicit and regression-tested).

  Backend support for `lines` editing already existed before this pass
  (`SourceRecordPatch` already listed `'lines'`; `NON_FINANCIAL_EDITABLE_FIELDS`
  in `transport-cost-lifecycle.service.ts` already listed `'lines'`) --
  confirmed by reading both before implementing, so no backend change was
  needed for Objective 2 itself.

**Tests:**
- `tests/unit/transport-cost/transport-cost-record-command.service.spec.ts`,
  new `describe('Edit: multi-line lines[] patch (Objective 2 gap
  closure)', ...)` (5 tests): a `lines` patch (add/edit/reorder) applies
  and is stored verbatim; `lines` is confirmed non-financial (editable on
  a posted record with zero ledger consequence); a `lines`-only patch does
  **not** auto-sync the flat fields (pins the invariant above); a combined
  `lines` + flat-field patch (the exact shape `EditRecordDialog.tsx`
  sends) keeps both in sync; a legacy record with `lines === undefined`
  can still have its flat fields edited without a `lines` array being
  fabricated for it.
- `npx tsc --noEmit` clean across the whole project after this change
  (see Verification below).

---

## Objective 3 -- Review queue alternative identity selection

**Gap:** The review queue's confirm-match flow needed an explicit,
tested "pick a different existing transporter/vehicle than the suggested
match" capability with its own audit trail, plus adversarial coverage.

**What was found (by reading the handlers before writing anything):**
`ConfirmReviewMatchHandler` already accepted *any* tenant-scoped
transporter/vehicle id as the confirmed match -- the "alternative
selection" capability existed structurally, but had (a) never been
exercised end-to-end by a test, and (b) had no audit-log call at all in
any of the three O2 review handlers (`ConfirmReviewMatchHandler`,
`ConfirmReviewNewHandler`, `RejectReviewItemHandler`).

**What changed:**
- Audit logging added to all three review handlers
  (`auditLog.logUpdate(...)` with a `wasAlternativeSelection` flag on
  confirm-match, distinguishing "operator picked the suggested candidate"
  from "operator picked a different one").
- Frontend: `IdentityPicker` (already built) reused as the alternative-
  selection search UI in the review queue -- no new master-data search
  infrastructure; it is the same component `EditRecordDialog.tsx` uses.

**Tests:** `tests/unit/transport-cost/normalization-review-gap-closure.spec.ts`,
`describe('Objective 3 -- ConfirmReviewMatchHandler: alternative identity
selection', ...)` and the audit-trail describe block (12 tests total for
this objective): alternative transporter/vehicle resolves and is audited
with `wasAlternativeSelection: true`; the suggested candidate still
audits `false`; adversarial cross-tenant candidate rejection
(`NotFoundError`); adversarial invalid/nonexistent candidate rejection;
adversarial merged-partner candidate rejection (`ConflictError`);
adversarial already-resolved item rejection (no double-processing);
confirm-new and reject audit entries asserted directly against the
mocked `auditLog`.

---

## Objective 4 -- Command Centre Slice B/C: drill-down and evidence

**Gap:** Command Centre metrics (summary bars, trend points, the
data-quality panel) had no drill-down into the underlying evidence rows,
risking silent disagreement between what a bar shows and what a
drill-down would show, and risking double-counting a multi-line
operation's cost across more than one bucket.

**Design principle, verified by reading the code before writing anything:**
a drill-down must reuse the *exact same* posting-scoping and bucket-key
logic the summary already uses -- otherwise a drill-down could show
different postings than the bar it was opened from represents.

**What changed:**
- `modules/transport-cost/services/transport-cost-report.service.ts` --
  extracted `fetchScopedPostings` (validation, vehicle-scope resolution,
  bounded posting fetch, destination/customer filter, vehicle/partner
  join) out of `getCommandCentreSummary`'s own Steps 1-3; both
  `getCommandCentreSummary` and the new `getCommandCentreDrillDown` now
  call this one shared method. Added `dimensionKeyFor(...)`, a single
  bucket-key function used identically by the summary's own aggregation
  loop and the drill-down's filtering, so a bar and its drill-down can
  never disagree about which postings belong to it.
- New `getCommandCentreDrillDown(context, periodStart, periodEnd,
  filters, dimensionConstraint?)`: returns up to
  `COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT` (500) evidence rows plus a
  `totals` figure reduced over the *full* matching set (so totals
  reconcile even when the row list is truncated).
- `modules/transport-cost/repositories/transport-cost-source-record.repository.ts`
  -- extracted `classifyDataQualityIssues` out of `getDataQualityBreakdown`'s
  inline loop; added `findByDataQualityIssue(...)`, which calls the same
  classifier, so the data-quality panel's COUNT and its new evidence ROWS
  can never drift apart.
- New routes (`TRANSPORT_COST_VIEW`-gated):
  `app/api/transport-cost/command-centre/drilldown/route.ts`,
  `app/api/transport-cost/command-centre/data-quality/[issue]/route.ts`.
- Frontend: `DimensionDrillDownDialog.tsx` and
  `DataQualityEvidenceDialog.tsx` (new), wired into
  `CommandCentrePage.tsx` -- clicking a trend point, a company bar, or a
  dimension-table row opens a drill-down preserving the active filters;
  every data-quality stat (including a previously-never-displayed
  `missingRegistration` stat -- the backend always computed it, only the
  UI had never rendered it) is now clickable through to its evidence
  rows, each linking to the operation detail page.

**Tests:**
- `tests/unit/transport-cost/transport-cost-command-centre-drilldown.service.spec.ts`
  (14 tests): company/transporter/destination/category/customer-constrained
  drill-downs reconcile to the summary's own bars; destination/customer
  drill-down uses the primary (flat) field, not the broader OR-over-lines
  filter match, so a multi-line operation is never double-counted;
  unconstrained (trend-point) drill-down respects period and filters;
  row-cap/truncation with totals still reconciling over the full set
  (seeded 503 rows); tenant/org-unit isolation; inverted/over-wide period
  rejection; data-quality evidence exact-row-match to the breakdown
  counts; empty-honest-result; tenant isolation; inverted-period
  rejection.
- `tests/security/transport-cost-command-centre.spec.ts` -- extended with
  route-wiring tests for both new routes plus an adversarial
  cross-tenant-enumeration test and a read-only (no-append) test.

---

## Objective 5 -- Add new master data (Transporter, Vehicle, Customer, Destination)

**Gap:** Operators needed a "search existing, or add new" flow for all
four master-data kinds directly from the Edit/review surfaces, reusing
the existing Slice 3 master-data architecture rather than building a
second one.

**What was already in place (confirmed by reading before writing):**
`SearchCreateSelect` (Customer/Destination -- synchronous create is
safe for these) and the transporter/vehicle request-new commands +
handlers + confirm/reject pending-master-data commands + handlers +
`ListPendingMasterDataHandler` were already implemented from an earlier
pass. This pass's work was verifying and testing that machinery, and
wiring `IdentityPicker`'s "Request new" action into `EditRecordDialog.tsx`.

**Tests:** `tests/unit/transport-cost/normalization-review-gap-closure.spec.ts`,
`describe('Objective 5 -- ...', ...)` (13 tests): creates a new
needs-review transporter/vehicle; dedups a case/whitespace-varied
duplicate name (`created: false`); tenant isolation (a same-named
duplicate in another tenant never suppresses creation); blank-name
rejection; nonexistent/cross-tenant/merged transporter rejection for a
vehicle request; confirm/reject pending master data with audit logging;
refuses confirming an already-confirmed row; requires a non-empty reject
reason; cross-tenant id 404s; `ListPendingMasterDataHandler` returns only
the caller's tenant's pending rows, excluding confirmed rows and other
tenants.
Route reachability (all 5 routes, `TRANSPORT_COST_NORMALIZE` for writes,
`TRANSPORT_COST_VIEW` for the pending-list read, never bare/ungated) is
pinned in `tests/security/gap-closure-routes-reachable.spec.ts`.

---

## Verification (this pass)

- **TypeScript:** `npx tsc --noEmit` -- clean, zero errors, across the
  whole project (re-run after the Objective 2 `lines[]` UI work,
  confirmed exit code 0).
- **Jest, full suite:** `npx jest --runInBand` -- **192 of 193 suites
  passed, 3384 of 3405 tests passed, 0 failed.** The one skipped suite
  (`tests/integration/persistence-invariants.spec.ts`, 21 tests) requires
  a real MongoDB instance to prove unique-index behavior; it self-skips
  with a loud warning when one isn't available (this sandbox has none)
  and is unrelated to any of the five objectives above -- it predates
  this pass and was already environment-gated before this work began.
- **Jest, targeted transport-cost/security suites:** 126 of 126 suites,
  2097 of 2097 tests passed on a dedicated re-run.
- **Lint:** `npx eslint` on every file this pass touched. 73
  pre-existing `@typescript-eslint/no-explicit-any` /
  `@typescript-eslint/no-require-imports` errors surfaced, all traced
  line-by-line to either (a) code that predates this pass and that this
  pass did not modify, or (b) a `jest.mock(...)`-with-`FakeCollection`
  test-harness pattern this codebase's *existing*, untouched test files
  already use identically (verified by linting two untouched baseline
  spec files and finding the same error shapes). Every line this pass
  actually added or changed was checked individually against the error
  list -- **zero new lint violations were introduced by this pass.** No
  pre-existing lint debt outside this pass's own files was touched or
  "fixed" in passing, per the task's explicit scope boundary.
- **Database:** not reset, not archived, no data deleted. Every change
  in this pass is additive (new constructor parameter with a
  backward-compatible default, new methods, new routes, new UI); nothing
  removes or migrates existing collections or documents.

## Known limitations (documented, not silently dropped)

- Bulk-imported rows never produce a genuine multi-line (`lines.length >
  1`) operation -- only the 3rd Party manual-entry form does. This is an
  existing, pre-this-pass architectural decision (there is no reliable
  signal in the bulk source files to distinguish "two rows are the same
  trip" from "two rows are separate trips," and inventing one risks a
  false merge of real financial records) -- Objective 2's lines editor
  does not change this; it only lets an operator edit lines an operation
  already has.
- Rejecting a pending Transporter/Vehicle (Objective 5) does not
  retroactively unlink or re-point any `TransportCostSourceRecord` that
  already selected that identity while it was pending -- an
  already-attributed row must be corrected individually via the existing
  Edit flow if the rejection means the attribution itself was wrong. This
  mirrors `RejectReviewItemHandler`'s own existing scope and was a
  pre-existing decision, not introduced by this pass.
- The Command Centre drill-down caps evidence rows at 500 per dialog
  (`COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT`); `totals` always reconciles
  over the full matching set regardless of the cap, and the dialog states
  `truncated: true` when a cap was hit, but an operator wanting every
  individual row beyond 500 must narrow the filters further.
