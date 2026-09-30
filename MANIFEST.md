# Delivery manifest -- Expense Intelligence Report UI + Driver Fuel Intelligence fix

Tenant: Willsgrove Farm Enterprises_Harare (`willsgrove-farm-enterprises-9e80ed`)
Date: 2026-09-30

This delivery contains two independent pieces of work, both requested in
the same message. Every file below is a full file (not a diff) at the
path it belongs at in the repo root -- copy over the corresponding paths
in your working tree.

## 1. Expense Intelligence Report -- frontend UI (NEW)

The backend for this report (service, types, utils, controller, API
route, 55 tests) was delivered previously in
`expense-intelligence-report-backend.zip`. This delivery adds the UI that
calls it, mirroring the Monthly Fuel & Fleet Intelligence Report's
frontend structure. **Deliberately no driver section** -- expenses are
not attributed to drivers in this platform, matching the earlier scoping
decision for this report.

New files:

- `frontend/modules/expenses/types/expenseIntelligence.types.ts`
- `frontend/modules/expenses/services/expenseIntelligence.api.ts`
- `frontend/modules/expenses/hooks/useExpenseIntelligenceReport.ts`
- `frontend/modules/expenses/components/ExpenseIntelligenceReport/` (9 files: `LabeledValue.tsx`, `ExpensePositionCards.tsx`, `WhatChangedSection.tsx`, `CostDriversSection.tsx`, `CategoryMixSection.tsx`, `AbnormalFindingsSection.tsx`, `AllocationReconciliationSection.tsx`, `DataQualitySection.tsx`, `FindingsSection.tsx`, `index.ts`)
- `frontend/modules/expenses/pages/ExpenseIntelligenceReportPage.tsx`
- `app/(protected)/expenses/intelligence-report/page.tsx`

Edited (small, additive changes -- barrel exports, one route, one nav entry):

- `frontend/modules/expenses/components/index.ts`
- `frontend/modules/expenses/pages/index.ts`
- `frontend/modules/expenses/routes/index.ts`
- `frontend/modules/expenses/types/index.ts`
- `frontend/shared/ui/navigation/nav.config.ts` -- adds "Intelligence Report" under Expenses, gated on `Permission.ANALYTICS_EXPORT` (same permission the Fuel report's equivalent entry uses)

New page: **Expenses -> Intelligence Report** (`/expenses/intelligence-report`). Excel/PDF export buttons are deliberately omitted for now -- the backend currently returns 501 for those formats; the page shows a note that they're coming in a follow-up release instead of a broken button. JSON report view is fully functional.

No frontend component tests exist anywhere in this codebase (confirmed by search) -- this UI follows that established convention; correctness is covered by the already-delivered backend's 55 tests plus this delivery's `tsc`/`eslint`/`nav-config.spec.ts` verification below.

## 2. Driver Fuel Intelligence -- "Unassigned cost share" fix

### What you asked for, and why it wasn't a one-line change

Your message described this as a straightforward math fix now that fuel
logs get their driver from the Vehicle Hub ("so no unassigned now"). That's
true for the **Fuel Logs table** and the **"Fuel cost by driver" chart** --
both were switched to resolve the driver from `Vehicle.currentDriverId`
in an earlier phase of this engagement.

It is **not** true for the Driver Fuel Findings section of the *Monthly
Fuel & Fleet Intelligence Report*, specifically the "Unassigned cost
share" figure there. That figure has always been computed from
`FuelLog.driver_id` -- the driver recorded **at the moment of entry** --
and PART 4 of this engagement's original brief explicitly required that
this stay true forever: fuel attribution must never be silently rewritten
by a later Vehicle Hub reassignment, because it's the audit trail of who
actually fuelled which vehicle when. `shared/types/fuel.types.ts`'s own
doc comments, `RESET-INSTRUCTIONS.md`, and
`tests/security/reset-driver-assignments-safety.spec.ts` all encode this
same constraint.

So "fix the math" had two possible readings that point in opposite
directions: (a) repoint this figure at the Vehicle Hub too, which would
satisfy your literal request but silently reverse a brief-mandated
architectural decision, or (b) leave it alone, which honors PART 4 but
does nothing about the real problem you're pointing at -- this report now
visibly disagrees with the Fuel Logs table/chart for the same period,
which is confusing regardless of which one is "correct."

I asked, and you chose the third option: **show both, side by side, never
merged.**

### What changed

The Driver Fuel Findings section of the report (JSON, Excel, and PDF) now
shows two independently-computed figures:

1. **"Unassigned cost share (entry-time)"** -- unchanged math, unchanged
   data source (`FuelLog.driver_id`). Still the permanent, PART-4-protected
   audit trail. Still computed by `getFuelByDriver`.
2. **"Vehicle Hub coverage"** (new) -- fuel cost sitting with a vehicle
   that currently has *no driver assigned on the Hub*, computed from
   `Vehicle.currentDriverId` via a new `getFuelByAssignedDriver` repository
   call -- the exact same resolution the Fuel Logs table and "Fuel cost by
   driver" chart already use for display. This is a live snapshot, not an
   audit trail: it reflects today's Hub assignments applied retroactively
   to the period's fuel cost, and will change if Hub assignments change,
   unlike figure 1.

Both numbers are labeled in the UI/PDF/Excel with a short note (sourced
from the backend, so the explanation can't drift out of sync with the
logic) making clear these answer different questions and are not meant to
reconcile with each other.

The existing "Unassigned driver cost share" *finding* (fires when the
entry-time share is >=20%) now appends the Hub-coverage figure to its
`why` text for context, so a reader isn't left wondering why the report's
finding and the live UI seem to disagree -- without changing what triggers
the finding or diluting the entry-time number it's about.

### Files changed

Backend:
- `modules/fuel/reporting/fuel-intelligence.types.ts` -- 3 new fields on `DriverFindingsSection` (`currentAssignmentUnassignedCost`, `currentAssignmentUnassignedSharePercent`, `currentAssignmentNote`), documented inline
- `modules/fuel/reporting/monthly-fuel-intelligence.service.ts` -- new `getFuelByAssignedDriver` call alongside the existing `getFuelByDriver` call; `buildDriverFindings` computes both lenses; the "unassigned share" finding's `why` text gets the Hub-coverage context appended
- `modules/fuel/reporting/fuel-intelligence-pdf.generator.ts` -- new "Vehicle Hub coverage" subsection under Driver Fuel Intelligence
- `modules/fuel/reporting/fuel-intelligence-excel.generator.ts` -- same, in the "04 Driver Fuel Intelligence" sheet

Frontend:
- `frontend/modules/fuel/types/fuelIntelligence.types.ts` -- mirrors the 3 new fields
- `frontend/modules/fuel/components/FuelIntelligenceReport/DriverFindingsSection.tsx` -- renders the new Hub-coverage block in a visually distinct panel below the entry-time figure

Documentation (corrected -- see below):
- `RESET-INSTRUCTIONS.md`
- `scripts/reset-driver-assignments.ts`

Tests (updated for the new repository call + new fields; new coverage added, not just mechanical mock fixes):
- `tests/unit/fuel/monthly-fuel-intelligence.service.spec.ts`
- `tests/security/fuel-intelligence-report-scope.spec.ts`
- `tests/unit/fuel/fuel-intelligence-pdf.generator.spec.ts`
- `tests/unit/fuel/fuel-intelligence-excel.generator.spec.ts`

### A documentation bug I found and fixed while I was in there

`RESET-INSTRUCTIONS.md` and `scripts/reset-driver-assignments.ts` both
still claimed, in a few places, that driver attribution is
transaction-time "everywhere in the platform" and that running the
driver-assignment reset script "will not change a single number" anywhere
in fuel reporting. That was true when it was written, but became false
once the Fuel Logs table/chart were switched to Vehicle Hub resolution in
an earlier phase of this engagement -- nobody went back and updated these
two documents. I've corrected both in place to say precisely what does
and doesn't change: the reset script still never touches any fuel log or
rewrites historical attribution (that guarantee is real and still
enforced by the 9 tests in
`tests/security/reset-driver-assignments-safety.spec.ts`), but it now
does have a live-snapshot effect on the Fuel Logs table, the "Fuel cost
by driver" chart, and the new "Vehicle Hub coverage" figure described
above, since all three read `Vehicle.currentDriverId` for display. I
flagged this as a found-and-fixed doc bug rather than quietly rewriting
it, since it's the kind of stale claim that causes real confusion if
someone trusts it during an incident.

## Verification (both pieces together)

- `npx tsc --noEmit` (whole repo): **0 errors**
- `npx eslint` on every new/changed file across both pieces of work: **0 errors, 0 warnings**
- `npx jest tests/unit/navigation/nav-config.spec.ts`: **16/16 passed** (includes "every href resolves to a page that exists on disk," covering the new Expense Intelligence Report nav entry)
- Full `npx jest` suite: **3606 passed, 21 skipped, 0 failed** (209 of 210 suites; 1 suite skipped for its own unrelated, pre-existing reason -- not a suite touched by this delivery). The 21 skipped tests are a known, pre-existing mongodb-memory-server limitation in this sandbox (cannot download a real MongoDB binary) -- unrelated to this change, present before this delivery too.
- New test coverage added, not just mock-signature fixes: `monthly-fuel-intelligence.service.spec.ts` gained a populated-period test asserting the two driver-attribution lenses are computed independently and never merged, plus UNAVAILABLE-handling coverage for the empty-period case; `fuel-intelligence-excel.generator.spec.ts` gained a test reading the actual rendered "Vehicle Hub coverage" cells back out of the generated workbook.

## Suggested manual smoke test

1. Open a tenant with fuel logs where some vehicles currently have no
   Hub driver assigned, and some historical fuel logs have no
   `driver_id`.
2. Generate the Monthly Fuel & Fleet Intelligence Report (JSON view,
   then Excel, then PDF) and confirm both "Unassigned cost share
   (entry-time)" and "Vehicle Hub coverage" appear, with different
   numbers, each with its own explanatory note.
3. Separately, open **Expenses -> Intelligence Report** and confirm it
   loads a report for the current month with no driver-related section
   anywhere on the page.
