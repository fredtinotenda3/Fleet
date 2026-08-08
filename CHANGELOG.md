# AI service scoping — pass 1 of 4: driver-risk

Scopes `driverRiskService` the same way `fleetHealthService` already is,
and unblocks it in `ai.controller.ts` for scope-narrowed callers.

## Files changed (3)

1. **`modules/ai/services/driver-risk.service.ts`**
   - `calculateDriverRisk(tenantId, context?)` now accepts an optional
     `TenantContext`.
   - The driver roster (`organization.members`) is filtered to only
     members whose `orgUnitId` is in `context.accessibleOrgUnitIds` when
     scoped — same fail-closed pattern documented in
     `driver.tenancy-addendum.ts`: an unassigned member is invisible to a
     scoped caller until assigned to an org unit.
   - `tripRepository.findMany` and `telematicsRepository.findMany` calls
     now merge `tenantScopeService.buildFilter(context, 'orgUnitId')`,
     identically to how `fleet-health.service.ts` does it.
   - **Flagged, not fixed:** this service matches trips to drivers via
     `member.userId === trip.driver_id`. There's a separate, dedicated
     `tbldrivers` collection (`modules/drivers`) with its own
     `orgUnitId`-scoped roster (`driverRepository.findAllInScope`), and
     the fuel module's `DriverSelect` picker binds `driver_id` to *that*
     collection's `_id`, not a user's `userId`. `TripForm`'s own
     `driver_id` field is a free-text input bound to neither. I don't
     have production data to tell which shape your real `driver_id`
     values are in, and swapping the source entity is a behavior change,
     not a mechanical scoping fix — left a code comment flagging this
     rather than guessing. Worth a quick check against a real
     `tbltrips` document before trusting this panel's numbers in
     production.

2. **`modules/ai/controllers/ai.controller.ts`**
   - `getDriverRisk`: removed the fail-closed gate, now passes
     `aiContext` through to the service (mirrors `getFleetHealth`).
   - `getAIDashboard`: previously blocked the *entire* combined dashboard
     for any scope-narrowed caller. Now returns real `fleetHealth` and
     `driverRisk` data for scoped callers, while `predictiveMaintenance`,
     `fuelFraud`, and `expenseAnomalies` still return the explicit
     "unavailable for your scope" placeholder until each is scoped in
     turn.

3. **`tests/security/driver-risk-scope.spec.ts`** (new)
   - 5 tests, mocking at the same repository boundary as the existing
     `org-unit-descendants-objectid.spec.ts`: org-wide caller sees every
     driver; a branch-scoped caller sees only that branch's driver and
     the trip query carries the `orgUnitId` filter; an empty
     `accessibleOrgUnitIds` fails closed; an unassigned member is
     invisible to a scoped caller.

## Verification performed

- `npx tsc --noEmit` — 0 errors.
- `npx jest tests/security` — **216/216 passing** (211 pre-existing +
  5 new), including the new `driver-risk-scope.spec.ts`.

## What's still gated (per `ai.controller.ts`'s own containment note)

`predictive-maintenance`, `fuel-fraud-detection`, and
`expense-anomaly-detection` are unchanged — still fail-closed for
scope-narrowed callers. Same treatment planned for each, one at a time.
Suggest `predictive-maintenance` next since it's the one your enhancement
doc calls out as differentiator.

## How to apply

Unzip over your working copy (this only touches the 3 files above),
then:

```bash
npx tsc --noEmit     # should report 0 errors
npx jest tests/security
```
