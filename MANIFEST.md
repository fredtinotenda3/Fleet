# Fleet — vehicle-create 500: real root cause

51 files. **The org lookup was never the problem this time.**

## 1–3. Trace, reproduction, and the exact line

`createVehicle` chain:

```
POST /api/vehicles
 └─ resolveTenantContext(req)              → OK (reads work, so this resolves)
 └─ resolveCreationOrgUnitId(context, …)    → returns Harare Branch id
 └─ vehicleCommandService.createVehicle
     └─ CreateVehicleHandler
         ├─ vehicleRepo.count({}, tenantId)
         ├─ organizationService.checkVehicleLimit(tenantId, count, tenantId)
         │    └─ getOrganization → resolveOrganization   ← ALREADY FIXED, present in this build
         ├─ vehicleRepo.create(...)
         └─ await eventBus.publish(VehicleCreatedEvent)  ← awaited; a throwing subscriber 500s the request
 └─ catch → this.handleError(error)
```

**The throw site is `vehicle.controller.ts:492`, `handleError`:**

```ts
if (error instanceof AppError) { return errorResponse(error.message, error.code, error.statusCode); }
console.error('[VehicleController] Unexpected error:', error);
return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);   // ← line reached
```

It only reaches the 500 when `instanceof AppError` is **false**. Your log is the
proof:

```
[VehicleController] Unexpected error: i: Organiza…
```

`i:` is a **minified constructor name**. A plain object or string prints no
constructor name — that prefix means a real `Error` subclass was thrown and the
`instanceof` check failed to recognise it.

## Why the previous fix didn't cover it

The previous fix corrected the organization **lookup**. This is a separate defect
in error **classification**, sitting downstream, masking whatever the lookup still
reports. `instanceof` compares against the `AppError` constructor reachable from
the checking file. Next's bundler can instantiate `app.errors.ts` more than once —
separate route bundles, and the dynamic `await import()` calls in
`NotificationHandler` and the tenancy paths. Each instantiation is a distinct class
object, so an error crossing that boundary fails `instanceof` despite being the
same class by name and shape.

So a legitimate `NotFoundError` — message beginning `Organization …` — was being
reported as an unexpected 500, and the client timeout followed. Identically for all
**51** controllers.

## 4. The fix

- `isAppError()` — structural guard in `app.errors.ts`. Holds across duplicate
  module instances. Deliberately narrow: `code` **and** `statusCode` must both be
  present and correctly typed, so an arbitrary object can't impersonate a domain
  error and choose its own HTTP status.
- `describeError()` — flat log object, so the message and stack print in full
  instead of truncating at the constructor name. This is what cost three rounds of
  guessing.
- Applied to **40 controllers** plus the vehicle controller.

`orgUnitId` auto-assignment was already correct and is unchanged.

**Deploy and retry.** If creation still fails you will now get the real status and
the full message — most likely `400 VEHICLE_LIMIT_REACHED`, since
`features.maxVehicles` is 10 and you have 76 vehicles:

```js
db.tblorganizations.updateOne({ slug: "willsgrove-farm-enterprises-9e80ed" },
  { $set: { "features.maxVehicles": 500 } })
```

## Also included (from the previous pass, unchanged)
Global search scoping, drivers-create `orgUnitId`, four consolidated
`resolveTenantContext` copies, `db:purge-sentinels`, Sentry removal,
`SECURITY-CREDENTIALS.md`.

## NOT done
- **Export paths** (CSV/Excel/print for expenses, fuel, maintenance, trips) — not
  audited. Still treat as a suspected leak.
- **AI services** — still the fail-closed placeholder.
- **Remaining type errors** — 83, unchanged.

## Verification
`npm run test:security` **196/196** (6 new) · `npx tsc --noEmit` **83** (baseline 83).
