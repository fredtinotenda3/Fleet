# Fleet — TypeScript build-error fix pass

## Honest status check first

Before touching anything, I unzipped your actual `Fleet-main.zip` and ran
`npx tsc --noEmit` myself rather than trusting the pasted transcript from the
earlier session(s). The real, current count was **18 errors**, not 79/56/41/38
— it looks like most of the earlier fixes already made it into this zip
(credential leaks, barrel exports, indexes.ts crash, Base UI null-normalization,
AnalyticsOverview exclusion, etc. were all already present and correct).

This pass fixes the **18 that were actually still failing**, and re-verifies
from a clean install.

**Result: `npx tsc --noEmit` now exits 0 — zero errors.**

`next.config.ts`'s `typescript.ignoreBuildErrors` has been flipped to `false`,
so a future type error will fail the build instead of shipping silently
(this is the class of bug that caused the earlier trip-import 501 and the
reporting-route param bug to reach production undetected).

## Files changed (11)

1. **`frontend/shared/forms/index.ts`** — file was comment-only, which isn't
   a valid TS module. Added `export {};`.
2. **`modules/reporting/generators/pdf-report.generator.ts`** — no code
   change; fixed by installing `@types/pdfkit` (see package.json/lock).
3. **`frontend/modules/fuel/components/FuelFilters.tsx`** — Base UI's
   `Select.onValueChange` passes `string | null`; two call sites assumed
   `string | undefined`. Normalized `null` → `undefined` at the boundary.
4. **`frontend/modules/maintenance/pages/MaintenanceListPage.tsx`** —
   `handleSubmit` was still typed against the pre-transform
   `MaintenanceFormValues` (`due_date: string | Date`) instead of the
   post-zod-transform `MaintenanceFormOutput` (`due_date: Date`) that
   `MaintenanceForm`/`MaintenanceModal` actually deliver. Retyped to match.
   Also added non-null assertions on `record._id` at 4 call sites — `_id` is
   optional on the `Reminder` type (to allow not-yet-persisted entities) but
   every record rendered in this list came from the API and is guaranteed
   to have one.
5. **`OverdueMaintenancePage.tsx`**, **`ServiceCalendarPage.tsx`**,
   **`UpcomingMaintenancePage.tsx`**, **`VehicleMaintenanceHistoryPage.tsx`**
   — same `record._id!` pattern, one call site each (two in
   VehicleMaintenanceHistoryPage: delete + complete + view + edit).
6. **`next.config.ts`** — `ignoreBuildErrors: true` → `false`.
7. **`package.json` / `package-lock.json`** — added `@types/pdfkit` as a
   devDependency.

## Verification performed in this sandbox

- Fresh `npm install` from your uploaded zip (not reused state).
- `npx tsc --noEmit` — **0 errors** (was 18 before this pass).
- `npx next build` — compiles and reaches webpack bundling; fails only on
  fetching Google Fonts (`fonts.googleapis.com`), which this sandbox's
  network policy blocks. That's an environment restriction here, not a code
  issue — your normal machine/CI has open network access and this will not
  reproduce there. If you want, run `npm run build` locally right after
  unzipping this to confirm end-to-end.
- `npx next lint` — **not** part of this pass. It currently reports 18
  errors (mostly `no-explicit-any` and unused vars, no logic bugs spotted).
  `eslint.ignoreDuringBuilds` is still `true`, so lint won't block your
  build. Say the word and I'll clean those up and flip that flag too.

## What this pass deliberately did NOT touch

Per your priority list, this pass was scoped to **P0 #2** (remove
`ignoreBuildErrors`, fix the remaining TS errors) only, since that's what
was actually still broken. The other items from your list are real,
separate bodies of work, not something a mechanical type-error fix touches:

- **P0 #1 — scope the 4 gated AI services** (driver-risk, fuel-fraud,
  predictive-maintenance, expense-anomaly): each needs its multi-stage
  aggregation pipeline audited collection-by-collection against
  `TenantContext`, the way `fleet-health` was done. This is real design +
  implementation work per service, not a batch fix — I'd want to go
  service-by-service with you, confirm the aggregation stages, and get
  each one to the same conformance-test coverage `fleet-health` has before
  unblocking it. Recommend we do this next, one service at a time.
- **P1 — real trip import** (`POST /api/trips/import`): needs the
  column-mapping UI, duplicate-detection policy, and partial-failure
  handling decided before implementation, per your own manifest.
- **P1 — Unified "Needs Attention" feed**: depends on the AI services above
  being live first.
- **P2 — design-token pass, Insurance/ESG module**: net-new scope.

## How to apply this

This zip contains only the changed files, same relative paths as your repo
root. Unzip over your working copy (or diff/merge by hand if you have local
changes), then:

```bash
npm install
npx tsc --noEmit   # should report 0 errors
npm run build
```
