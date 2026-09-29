# Driver-to-Vehicle Assignment Reset -- Instructions

This is the safe, explicit reset requested in this engagement's brief
(PART 3), built to the letter of the constraint given (PART 20): it
resets **only** the current driver-to-vehicle assignment relationship.
It does **not** touch fuel records, vehicles, drivers, allocation
history, expenses, trips, users, auth, permissions, or tenancy in any
way.

## What this script does

For every vehicle in the tenant you specify, it clears
`Vehicle.currentDriverId` (sets it to `null`) if that vehicle
currently has a driver assigned. That is the **only** field it ever
writes.

It does this because it is the one and only field the platform's
"assign driver to vehicle" feature (the Vehicle Hub) ever writes --
confirmed by reading `assign-vehicle-driver.handler.ts`, the sole
writer of `Vehicle.currentDriverId` in the codebase.

## What this script does NOT do (verified, not assumed)

- Does **not** delete or modify any fuel log (`tblfuellogs`).
- Does **not** delete or modify any vehicle record beyond the one
  field named above.
- Does **not** delete or modify any driver record (`tbldrivers`).
- Does **not** delete or modify allocation ledger history.
- Does **not** delete or modify expenses, trips, or any other business
  data.
- Does **not** touch users, authentication, permissions, or tenant
  configuration.
- **Never runs automatically** -- it is not wired into any build,
  deploy, seed, or startup script. It only runs when you invoke it by
  hand.

These properties are enforced by 9 automated structural tests in
`tests/security/reset-driver-assignments-safety.spec.ts` (see
`MANIFEST.md` for the exact test count and result), which read the
script's actual source and fail the build if a future edit ever
widens its scope beyond `currentDriverId`/`updatedAt` on
`tblvehicles`.

## Critically important: this has NO effect on fuel analytics

Fuel cost/consumption "by driver" in the Monthly Fuel & Fleet
Intelligence Report (and everywhere else in the platform) is
**transaction-time attribution**: each fuel log records who fuelled
the vehicle *at the moment of that fuel entry* (`FuelLog.driver_id`),
set once when the entry is created and never re-derived from the
vehicle's current assignment. This is a deliberate, pre-existing
architectural decision (see `shared/types/fuel.types.ts`'s own doc
comments, and PART 4 of this engagement's brief, which explicitly
required this and was verified already correct).

**Running this reset script will not change who any past fuel log is
attributed to.** It only clears which driver each vehicle is
*currently* assigned to going forward, on the Vehicle Hub. If you
expected clearing driver assignments to also clear "Driver Fuel
Intelligence" history, that is a different operation this script does
not perform (and the platform does not have a feature to "rewrite"
historical fuel attribution -- by design, since doing so would corrupt
the audit trail of who actually fuelled which vehicle when).

## How to run it

Always run a dry run first. The script defaults to dry-run and will
not write anything unless you pass `--confirm`.

### 1. Dry run (shows what would change, changes nothing)

```bash
npm run db:reset-driver-assignments -- --tenant <tenant-slug>
```

This prints a manifest: every vehicle currently assigned a driver,
its license plate, and the driver's name, so you can review it before
committing to anything.

### 2. Apply the reset

Only after reviewing the dry-run output:

```bash
npm run db:reset-driver-assignments -- --tenant <tenant-slug> --confirm
```

This clears `currentDriverId` on exactly the vehicles listed in the
dry run, and writes one audit record to `tbltenant_repair_audit` with
`action: 'DRIVER_ASSIGNMENT_RESET'` containing a full before/after
list (vehicle, previous driver ID, previous driver name), so the
change is fully reversible by reference (see below).

## Reversibility

The audit record written on `--confirm` contains every vehicle's
previous driver assignment. To undo the reset, look up the audit
record in `tbltenant_repair_audit` (filtered by `action:
'DRIVER_ASSIGNMENT_RESET'` and the tenant) and re-assign each listed
vehicle to its previous driver via the Vehicle Hub (or a similarly
scoped script) -- the reset itself does not include an automatic
undo command, by design, to avoid a second script with its own write
path to verify.

## Safety properties (verified)

Run the dedicated test file to re-verify these properties at any
time:

```bash
npx jest tests/security/reset-driver-assignments-safety.spec.ts
```

At the time of this delivery, all 9 tests pass. See `MANIFEST.md` for
the full test run summary.
