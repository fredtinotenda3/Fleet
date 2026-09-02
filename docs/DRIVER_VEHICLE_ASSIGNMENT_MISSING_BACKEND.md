# Driver ↔ Vehicle assignment: missing backend

**Status: frontend built, backend not implemented.** Nothing in this doc
has been wired into `app/api/**` or `modules/vehicles|drivers/**`. This is
a spec for the next backend change, not a description of shipped code.

## What was searched

Before writing any UI, the following were checked for an existing
driver-vehicle link and none was found:

- `shared/types/vehicle.types.ts` — `Vehicle` has no `driverId`,
  `currentDriverId`, or any driver reference field.
- `modules/vehicles/dto/vehicle-response.dto.ts` — never serializes a
  driver field; there is nothing for the frontend to read even if the
  type existed.
- `shared/types/driver.types.ts` — `Driver` has no vehicle reference.
- `app/api/vehicles/**`, `app/api/drivers/**` — no
  `.../driver`, `.../vehicle`, or `/assign` route of any kind.
- No `DriverAssignment` / `VehicleDriver` model, collection, or
  repository anywhere in `modules/**` or `infrastructure/database/**`.
- The closest existing concepts are **time-boxed and belong to a
  different feature**, not a persistent "current driver" on a vehicle:
  - `modules/scheduling` (`DriverShift`: `driverId` + optional
    `vehicleId` + `startTime`/`endTime`) — shift scheduling, not vehicle
    ownership.
  - `modules/dispatch` (`DispatchJob.assignedDriverId` /
    `assignedVehicleId`) — per-job assignment, cleared when the job ends.
  - `modules/trips` (`Trip.driver_id`) — per-trip, historical.

None of these persist "this vehicle's driver right now," which is what
was requested, so a new endpoint is required. Per instructions, no
backend route was added or modified to make one up.

## One relevant thing that *does* already exist

`server/permissions/roles.ts` already defines:

```ts
DRIVER_ASSIGN = 'driver:assign'
```

...and grants it to `FLEET_MANAGER`, `DISPATCHER`, `SUPERVISOR`, and
`BRANCH_MANAGER` (confirmed by grepping every `DRIVER_ASSIGN` reference
back to its role block — `DEPARTMENT_MANAGER`, despite being adjacent to
`BRANCH_MANAGER` in most other permission lists, does **not** hold it)
— but before this change **no code in the repo referenced it**. It looks like this permission was
modeled for exactly this feature ahead of time. The frontend gates the
new UI on it (`canAssignDriverToVehicle()` in
`frontend/modules/drivers/utils/index.ts`) instead of introducing a new
permission, but the server-side route enforcing it does not exist yet.

## Suggested endpoint

Mirroring the existing `PATCH /api/vehicles/[id]/status` slice
(command → handler → controller → route), which is the closest analog
already in the codebase:

### `PATCH /api/vehicles/:id/driver`

- **Auth**: `withAuth(..., { permission: Permission.DRIVER_ASSIGN })`
- **Body**: `{ driverId: string | null }` (`null`/omitted unassigns)
- **Response**: the updated `Vehicle`, extended with a denormalized
  driver reference — see "Response shape" below.
- **Behavior**:
  - Validate `driverId` exists, is not soft-deleted, and belongs to the
    same tenant (`tenantId`) as the vehicle — mirror the tenant checks
    `VehicleRepository`/`DriverRepository` already do elsewhere.
  - Needs a product decision: can one driver be assigned to more than
    one vehicle at a time? If not, this handler also has to unassign the
    driver from any other vehicle in the same transaction/update, which
    changes the shape of the write (touches two documents, not one).
    This doc intentionally does not decide that; it is a business rule,
    not a frontend concern.
  - Emit a `VehicleUpdatedEvent` (and ideally a dedicated
    `VEHICLE_DRIVER_ASSIGNED` / `VEHICLE_DRIVER_UNASSIGNED` event) the
    same way `UpdateVehicleStatusHandler` does, so audit log / activity
    feed entries keep working — `VehicleDetailPage`'s Activity tab reads
    from `GET /api/security/audit-log`, which already exists.

Suggested files (none created by this change):

```
modules/vehicles/commands/assign-vehicle-driver.command.ts
modules/vehicles/commands/handlers/assign-vehicle-driver.handler.ts
app/api/vehicles/[id]/driver/route.ts
```

### Schema / DTO change

`shared/types/vehicle.types.ts` needs a field to persist the
assignment, e.g.:

```ts
export interface Vehicle extends BaseEntity {
  // ...existing fields
  currentDriverId?: string;
}
```

`modules/vehicles/dto/vehicle-response.dto.ts` then needs to resolve
and embed a `DriverRef` (the same minimal shape already used by
`FuelLog.driver` in `shared/types/driver.types.ts`) so list/detail
responses don't force the frontend into an N+1 driver lookup:

```ts
assignedDriver: DriverRef | null;
```

`infrastructure/database/indexes.ts` would also want an index on
`{ tenantId: 1, currentDriverId: 1 }` on `tblvehicles`, matching the
pattern used for `idx_shift_tenant_driver_start` etc.

### Response shape the frontend already expects

`frontend/modules/vehicles/types/index.ts` defines
`VehicleWithAssignment` (`Vehicle & { assignedDriver?: DriverRef | null }`)
and `AssignVehicleDriverPayload` (`{ driverId: string | null }`) against
this exact contract, so no frontend changes should be needed once the
route ships — only removing the "pending backend" notice in
`DriverAssignmentPanel.tsx`.

## What the frontend does in the meantime

- `vehiclesApi.assignDriver()` (`frontend/modules/vehicles/services/vehicles.api.ts`)
  calls `PATCH /api/vehicles/:id/driver` for real — it is not mocked or
  faked. Until the route above exists, this call will 404.
- `useAssignVehicleDriver()` surfaces that failure through the existing
  toast-on-error pattern rather than pretending the write succeeded.
- `DriverAssignmentPanel` shows an explicit in-product notice that the
  backend isn't deployed yet, so this doesn't ship as a silently broken
  button.
- Because `VehicleResponseDto` never sends a driver field today,
  `vehicle.assignedDriver` is always `undefined` for real API data — the
  panel correctly renders "No driver assigned" for every vehicle right
  now, not because that's true, but because the backend has no way to
  say otherwise yet.
