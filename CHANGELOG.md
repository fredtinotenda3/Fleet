# Cost-per-km engine frontend — wiring fixes

Verification confirmed the backend claim (0 TS errors, 379/379 security tests) is
correct, and confirmed the frontend claim (components exist but aren't wired) was
also correct — every listed component/type/hook already existed in the codebase.
Nothing needed to be built from scratch; six integration points needed wiring.
Re-ran `npx tsc --noEmit` (0 errors) and `npm run test:security` (29 suites,
379/379 passing) after all changes below.

## 1. Vehicle Detail Page — Costs tab
`VehicleCostsPanel` existed, unused. `frontend/modules/vehicles/pages/VehicleDetailPage.tsx`:
imported it, added a "Costs" tab between Analytics and Activity, passed
`vehicle._id`. Note: `Vehicle._id` is typed optional (`BaseEntity._id?: ID`) even
though it's always populated for a persisted vehicle in practice — added a guard
so this can't become a `tsc` failure.

## 2. Dashboard — Cost-per-km KPI card
`CostPerKmWidget` existed, unregistered. `frontend/shared/dashboards/WidgetRegistry.ts`:
added a `costPerKm` entry gated on `Permission.FINANCE_VIEW` (matches the
widget's own backend calls), added to `WIDGET_ORDER`. New widget keys already
flow through to existing per-user layouts via `DashboardPersistence.ts`'s
"add anything in WIDGET_ORDER missing from a saved layout" logic — no other
file needed to change.

## 3. Command Centre — Savings strip
`SavingsStrip` *was* already wired into `CommandCentrePage`, but it only
reflected the **value ledger** (resolved fuel-fraud/expense-anomaly savings),
not the finance module's **allocation ledger** the brief asked for — a real
gap, not a false alarm.

Every allocation-read endpoint except one requires a `vehicleId` by design
(`allocation.controller.ts` documents this as a deliberate anti-DoS
constraint — no fleet-wide unscoped ledger read). The one exception is
`GET /api/finance/gl/reconciliation`, which returns a pre-aggregated
`totalPlatform` figure for the whole org and period, gated on `FINANCE_VIEW`.
Used that:
- `frontend/modules/attention/hooks/useAttentionQueue.ts`: added
  `useMonthToDateAllocationTotal()`.
- `frontend/modules/attention/components/SavingsStrip.tsx`: added optional
  `allocationReport`/`isAllocationLoading`/`isAllocationError` props, rendered
  as a fourth figure ("Allocated ... from the GL ledger"). A caller without
  `FINANCE_VIEW` just doesn't see this figure — the rest of the strip is
  unaffected, matching the codebase's existing degrade-gracefully pattern
  (e.g. `CostPerKmWidget`'s own doc comment).
- `frontend/modules/attention/pages/CommandCentrePage.tsx`: wired the new
  hook's data into `SavingsStrip`.

## 4. GL Reconciliation page
Route was missing entirely — `GLReconciliationPage` component existed with no
`app/(protected)/reports/gl-reconciliation/page.tsx` to mount it.
- Added `app/(protected)/reports/gl-reconciliation/page.tsx` (thin entry
  point, same pattern as `reports/exports/page.tsx`).
- Added a "GL Reconciliation" sidebar entry under Reports in
  `frontend/shared/ui/navigation/Sidebar.tsx`, gated on `Permission.FINANCE_VIEW`
  (the same permission the route itself requires server-side).
- CSV export (`exportReconciliationCsv`) was already correctly wired in the
  page component — verified, no change needed.

## 5. Organisation Settings — Finance tab
`FinanceSection`, `financeSettingsSchema`, and `FinanceSettingsFormValues`
all already existed and were correctly exported from
`frontend/modules/organizations/schemas/index.ts` — but `FinanceSection` was
never imported into `OrganizationSettingsPage.tsx`, and no "Finance" tab
existed. Finance settings live on their own endpoint
(`GET/PUT /api/finance/settings`, gated on `FINANCE_MANAGE`, tenant-resolved
server-side) rather than on the organization document, so they needed their
own hook rather than reusing `useOrganizationSettings`'s mutations — used the
already-existing `useFinanceSettings()` from
`frontend/modules/finance/hooks/useFinance.ts`.

## 6. Shared finance frontend module
`frontend/modules/finance/{types,api,hooks,utils}` all present and correctly
structured. `formatMoney` already omits the `currency` key entirely when
undefined/empty rather than passing `currency: undefined` through to
`Intl.NumberFormat` (which throws) — verified this is already correct, no
change needed. `SavingsStrip`'s new allocation figure uses `formatMoney`
rather than the raw `formatCurrency`, for the same defensive reason.

## Files changed
- `frontend/modules/vehicles/pages/VehicleDetailPage.tsx`
- `frontend/shared/dashboards/WidgetRegistry.ts`
- `frontend/modules/attention/hooks/useAttentionQueue.ts`
- `frontend/modules/attention/components/SavingsStrip.tsx`
- `frontend/modules/attention/pages/CommandCentrePage.tsx`
- `app/(protected)/reports/gl-reconciliation/page.tsx` (new)
- `frontend/shared/ui/navigation/Sidebar.tsx`
- `frontend/modules/organizations/pages/OrganizationSettingsPage.tsx`

## Verification
```
npx tsc --noEmit        → 0 errors
npm run test:security   → 29 suites, 379/379 tests passing
```
