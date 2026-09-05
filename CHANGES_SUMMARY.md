# Driver data bugs -- diagnosis & fixes

## Scope of this delivery

Three reported symptoms were investigated end-to-end (route -> controller
-> service -> repository -> frontend hooks/components). Two were traced
to concrete, confirmed defects and fixed with regression tests. One
(driver creation persistence) was audited across the full stack and
found to already be correct in this codebase snapshot -- no defect was
reproducible, so no change was made there.

## 1. Driver creation shows success but doesn't appear in the list

**Status: audited, no defect found.**

Traced the full path: `DriverForm` -> `DriverModal` -> `DriversListPage
.handleSubmit` -> `useCreateDriver` -> `driversApi.create` -> `POST
/api/drivers` -> `DriverController.create` -> `DriverService.create` ->
`DriverRepository`/`BaseRepository.create` -> Mongo `insertOne`.

- The form only calls `onOpenChange(false)` (closing/"succeeding") after
  `await onSubmit(values)` resolves, and `onSubmit` is the mutation's
  `mutateAsync`, which throws on any non-2xx or `{success:false}`
  response (see `api-client.utils.ts#handleResponse`). A toast can only
  fire on genuine success.
- `useCreateDriver.onSuccess` calls
  `queryClient.invalidateQueries({ queryKey: driverKeys.all })`, which
  invalidates every list variant (`DriversTable`, `DriverSelect`
  pickers), so the table refetches immediately after creation.
- The repository's `create()` inserts via `insertOne` and only returns
  after `insertedId` is confirmed; org-unit stamping
  (`resolveCreationOrgUnitId`) ensures the new row is stamped with an
  org unit the creating user can subsequently read back.

No path was found where a success toast could fire without a confirmed
write, or where the list would fail to refetch. If this is still
observed in a live environment, the most useful next step is to check
the actual network response body for the `POST /api/drivers` call and
whether the creating user's org-unit assignment resolves to `null`/an
empty scope (which would cause `resolveCreationOrgUnitId` to throw
before any write, surfacing as a request error, not a false success).

## 2. Vehicle <-> driver assignment

**Status: fixed (driver picker itself was already correct; the
assignment RESULT was never visible).**

The driver picker (`DriverSelect`, used inside `DriverAssignmentPanel`)
already fetches from the real `tbldrivers` collection via
`useDriversList` -> `GET /api/drivers`, which is org-unit scoped and
picks up newly created drivers immediately (query invalidation, see
above). No defect found there.

The real, confirmed defect: **`VehicleResponseDto.assignedDriver` was
never populated.** The DTO existed, with a comment describing exactly
what it should do, but no controller method ever constructed one --
`getVehicle` and `assignVehicleDriver` both returned the raw `Vehicle`
document, whose only driver field is the bare `currentDriverId` id
string. The frontend's `VehicleWithAssignment.assignedDriver` was
therefore always `undefined` on real API responses, so
`DriverAssignmentPanel` displayed "Unassigned" even immediately after a
successful `PATCH /api/vehicles/:id/driver`.

Fixed in `modules/vehicles/controllers/vehicle.controller.ts`:
- Added `VehicleController.withAssignedDriver()`, which resolves
  `vehicle.currentDriverId` to a `DriverRef` via a single
  `driverRepository.findById()` call (no N+1 -- this only runs on the
  single-vehicle detail/assign paths, not the list).
- `getVehicle` and `assignVehicleDriver` now return the enriched
  `VehicleResponseDto` shape instead of the raw `Vehicle`.

Frontend updated to carry the richer type through:
- `frontend/modules/vehicles/services/vehicles.api.ts`:
  `getById()` now types its return as `VehicleWithAssignment`.
- `frontend/modules/vehicles/hooks/useVehicles.ts`: `useVehicle()`
  now types its query result as `VehicleWithAssignment`.
- `frontend/modules/vehicles/types/index.ts`,
  `frontend/modules/vehicles/hooks/useVehicleMutations.ts`,
  `frontend/modules/vehicles/components/DriverAssignmentPanel.tsx`:
  removed stale "PENDING BACKEND" / "not deployed yet" comments and a
  misleading in-app banner -- the backend route, permission gating, and
  cross-org-unit checks were already fully implemented and tested (see
  `tests/security/vehicle-driver-assignment-scope.spec.ts`,
  `tests/unit/vehicles/assign-vehicle-driver.handler.spec.ts`, both
  passing, untouched).

Tenant isolation, org-unit scoping, and permission gating for
assignment were already correctly enforced in
`VehicleController.assignVehicleDriver` (cross-org-unit driver
assignment returns 404, matching the existing "don't leak existence of
out-of-scope records" pattern) and are unchanged.

## 3. Driver Scorecard shows organization members as drivers

**Status: fixed -- root cause confirmed.**

`modules/ai/services/driver-risk.service.ts` built its driver roster
from `organization.members` (every account in the org: managers,
accountants, auditors, dispatchers, mechanics) instead of the real
`tbldrivers` collection, matching trips by `member.userId ===
trip.driver_id`. Every non-driver member had zero matching trips, so
each fell through to a default-safe 0/100 "Low" score -- exactly the
symptom reported (`harare.manager@...`, `workshop.manager@...`,
`accountant@...`, etc. all appearing with 0/100 Low).

Fixed by sourcing the roster from `driverRepository` (the same
repository and org-unit scoping method, `findAllInScope`/`findAll`,
already used by the Drivers table and the vehicle-assignment picker),
and matching trips/telematics by the driver's real `tbldrivers` `_id`
instead of a member's `userId`. An org with zero rows in `tbldrivers`
now correctly produces zero scored drivers.

Also updated the doc comment in
`frontend/modules/ai/pages/DriverScorecardPage.tsx` (no functional
change there -- it already just relayed `entityId`/`driverName` from
the batch endpoint) to reflect that the id is now a real `tbldrivers`
`_id`, not an `OrganizationMember.userId`.

## Tests

- `tests/security/driver-risk-scope.spec.ts` -- rewritten. The previous
  version mocked `organization.members` and asserted the buggy
  behavior (every member scored) as correct. Now mocks
  `driverRepository` and adds an explicit regression test: "organization
  members who are not real drivers never appear on the scorecard."
  Also covers: org-wide caller sees all drivers, org-unit-scoped caller
  only sees their branch's drivers, trip queries carry the org-unit
  filter, an empty `accessibleOrgUnitIds` array fails closed (zero
  drivers), and an empty driver store produces zero scored drivers.
- `tests/security/ai-evidence-services.spec.ts` -- updated the `driver
  risk` describe block's fixtures/mocks to use `driverRepository`
  instead of `organization.members`, matching the service change. No
  other describe blocks in this file were touched (fleet-health and
  predictive-maintenance still correctly use `organization.members` --
  that is not part of this bug and was left untouched, per the
  instruction not to modify unrelated modules).

## Verification

- `npx tsc --noEmit` -- clean, zero errors.
- `npx jest --testPathIgnorePatterns "/node_modules/" "/tests/integration/"`
  -- **105 suites / 1892 tests, all passing** (includes every
  driver/vehicle/security test in the repo, plus the full existing
  suite -- no regressions).

## Files changed/added (this ZIP)

```
modules/ai/services/driver-risk.service.ts                       (fix)
modules/vehicles/controllers/vehicle.controller.ts                (fix)
frontend/modules/ai/pages/DriverScorecardPage.tsx                 (doc only)
frontend/modules/vehicles/components/DriverAssignmentPanel.tsx    (fix + cleanup)
frontend/modules/vehicles/hooks/useVehicleMutations.ts            (doc only)
frontend/modules/vehicles/hooks/useVehicles.ts                    (type fix)
frontend/modules/vehicles/services/vehicles.api.ts                (type fix + doc)
frontend/modules/vehicles/types/index.ts                          (doc only)
tests/security/driver-risk-scope.spec.ts                          (rewritten)
tests/security/ai-evidence-services.spec.ts                       (updated)
```

Tenant isolation, org-unit scoping, permission gating, and all
pre-existing security tests are unchanged and continue to pass.
