# Scope Integrity & Dead-Connection Findings

Change set delivered 2026-09-07. 64 files (57 modified, 7 new).

Everything below was verified against the code, not inferred from the brief.
Where I could not establish something, it says so.

---

## Executive summary

The two bugs you reported are the same bug wearing two hats, and the class
they belong to had **eight** members, not one. Separately, the intelligence
layer that gives this product its name was not running at all, and two of the
numbers it did produce were fabricated — one of them is sitting in your live
database right now with a $5,000 price tag on it.

| # | Finding | Severity |
|---|---|---|
| 1 | Drivers create dropped `orgUnitId` twice before the write | **P1** — the reported bug |
| 2 | 10 write paths resolved a vehicle by plate with no tenant filter | **P0** |
| 3 | 8 modules filtered reads on `orgUnitId` and never wrote it | **P1** |
| 4 | Trip creation rejected every trip naming a driver | **P1** |
| 5 | `AIPredictionTriggerHandler` was 100% dead | **P1** |
| 6 | Fleet fuel efficiency fabricated from missing data | **P1** |
| 7 | Fuel-fraud distance summed cumulative odometers | **P2** |
| 8 | Fuel health score had inverted units; no data scored 100/100 | **P2** |
| 9 | Two registry `orgUnitSource` ladders could never run | **P3** |

---

## 1. `POST /api/drivers` 201, `GET /api/drivers` empty — root cause

`DriverController.create` computed an `orgUnitId` via `resolveCreationOrgUnitId`
and spread it into the request body. It was dropped **twice** before reaching
Mongo:

1. `driverCreateSchema` is a plain `z.object`, which **strips unknown keys** —
   `orgUnitId` is not one of its fields, so validation removed it.
2. Even had it survived, `DriverService.create` built an explicit allowlist
   payload that never named the field.

Meanwhile `getFilteredDriversInScope` — the only list path the controller
calls — filters on `{ orgUnitId: { $in: accessible } }`. **A field that is
never written cannot match that filter.** Your DB confirms it: no `tbldrivers`
document has an `orgUnitId`.

That also explains the second half of your report. An org-wide admin has
`accessibleOrgUnitIds === null`, so no filter is applied and they see
everything; a branch manager sees nothing. Same defect, two symptoms.

**What makes this worth dwelling on:** someone had already tried to fix it, in
the controller, and that fix looked correct in review. The value was computed;
it just never arrived. The repair moves the responsibility into
`DriverService.create`, so the function that *derives* the org unit is the
function that *writes* it — it cannot be stripped by validation or omitted by
a future allowlist edit, because it never passes through either.

---

## 2. P0 — cross-tenant vehicle resolution in ten write paths

Fuel, expense, trip, maintenance, work-order, fuel-card, DVIR and trip-import
create/update all resolved the vehicle like this:

```js
db.collection('tblvehicles').findOne({
  license_plate: String(plate).toUpperCase(),
  isDeleted: { $ne: true },
})
```

**No `tenantId`. No org-unit check.** The resolved vehicle's `orgUnitId` was
then copied onto the record. Three distinct defects in one query:

- **Cross-tenant.** `license_plate` has no unique index and is not unique
  across tenants — your own data has two distinct organizations both named
  "Toyota Zimbabwe". A fuel log created in tenant A could resolve tenant B's
  vehicle and inherit B's org unit. The row stays in A, so it is not a read
  leak; it is worse in a different way — A's financial record is now keyed to
  a foreign org unit, and the `200`-vs-`400` response is an oracle for whether
  another tenant owns a given plate.
- **Cross-org-unit.** A Harare branch manager could file against a Bulawayo
  truck. The record inherited Bulawayo's unit and vanished from the creator's
  own list. **This is your "branch manager sees incomplete branch data".**
- **Ambiguous plate.** `findOne` silently returns whichever document Mongo
  reached first. Two active vehicles sharing a plate meant costs landed against
  an arbitrary one of them, forever, with no error.

Two sites were partially scoped (`create-expense`, `workorder.service` used
`tenantId !== 'default' && tenantId !== 'system'`), which left the sentinel
branch open and never checked org units.

### The fix

Not "add `tenantId` to ten queries" — ten copies of a security decision drift,
and this repository has paid for that twice already (see the headers of
`server/tenancy/tenant-scope.ts` and `server/utils/tenant-context.utils.ts`).

Instead: **one resolver, and a parameter type that makes forgetting to scope a
write impossible to express.**

- `server/tenancy/write-scope.ts` — a required discriminated union. A caller
  must state `{kind:'user', context}` (org-unit scope **enforced**) or
  `{kind:'system', tenantId, reason}` (no acting user, so no user scope to
  check — `reason` is required so that branch is never reached by accident).
  There is deliberately **no** "unscoped" member.
- `modules/vehicles/services/vehicle-write-resolver.service.ts` — thin, and
  delegates to the already-tested `vehicleIdentityResolver` rather than
  re-implementing lookup. It adds the write-side policy: 400 vs 409, and
  out-of-scope reported **identically** to not-found so a scope-narrowed
  caller cannot enumerate another branch's plates one at a time.

An *optional* `context?: TenantContext` would have let the next call site
reproduce the exact omission the file exists to remove and still type-check —
the same reasoning already recorded for `createAlert`/`ResolvedAlertOwnership`.

---

## 3. Eight modules wrote no `orgUnitId` at all

| Module | Read filters on `orgUnitId`? | Write set it? | Now inherits from |
|---|---|---|---|
| drivers | yes | **no** (see §1) | submitter |
| dispatch | yes | **no** | submitter (job predates its vehicle) |
| bookings | yes | **no** | vehicle |
| inventory — spare parts | yes | **no** | submitter |
| inventory — stock movements | yes | **no** | parent part |
| workshop — bays | yes | **no** | submitter |
| workshop — mechanic assignments | yes | **no** | parent bay |
| digital-twin | yes | **no** | vehicle |
| scheduling — driver shifts | yes | **no** | driver, then vehicle |
| fuel-cards | yes (`getByIdInScope`) | **no** | vehicle, else submitter |
| expenses — **spreadsheet import only** | yes | **no** | vehicle |

Three of these had the behaviour **documented in their own type addendum** and
never implemented — `dispatch` ("falls back to the assigned vehicle's
orgUnitId once assigned"), `workshop` ("denormalized from the parent
WorkshopBay's orgUnitId at creation time"), `scheduling` ("Inherited from the
rostered driver"). The declaration is what gives false comfort.

The expense-import one is worth calling out separately: **every expense you
have ever loaded by spreadsheet is invisible to every scoped user**, in a
module whose interactive create path stamps the field correctly.

Digital twin is the largest by row count — 177 twins, none visible to a
scope-narrowed user. Fail-closed, so never a leak; a total loss of function
for exactly the roles it was built for.

### Why the existing conformance suite did not catch this

`module-scope-conformance.spec.ts` checks that an org-unit module has its
addendum and its **read** wiring. All eleven rows above passed it. Nothing
about the read was wrong.

Two new suites close that:

- `write-scope-conformance.spec.ts` — structural. Run against your untouched
  tree it goes red for bookings, dispatch, inventory, workshop, digital-twin
  and scheduling. It stays **green** for drivers and fuel-cards, because both
  files *mention* `orgUnitId` without any value reaching Mongo. That limit is
  documented in the file rather than papered over.
- `org-unit-write-roundtrip.spec.ts` — behavioural. Asserts the field is
  present in the document actually handed to the repository. This is what
  catches the two the structural net misses.

I re-injected each original defect and confirmed the tests fail:

| Re-injected defect | Tests that failed |
|---|---|
| `orgUnitId` removed from drivers payload allowlist | 4 |
| org-unit check removed from `resolveForWrite` | 3 |
| ambiguous-plate refusal removed | 1 |
| entire AI trigger reverted to `payload.vehicleId` | 8 of 10 |

---

## 4. Trip creation rejected every trip that named a driver

Both trip handlers validated the driver with:

```ts
findOne({ _id: validated.driver_id as any, isDeleted: { $ne: true } })
```

A **string** compared against an ObjectId `_id`. Mongo does not coerce between
the two, so the match always failed and every such trip was rejected with
`DRIVER_NOT_FOUND`. The `as any` is what let it compile. The lookup also had
no `tenantId`, so a cross-tenant driver would have satisfied it.

`tbltrips` has **zero rows**, which is consistent with this. I cannot prove it
is the only reason — I have no application logs — but it is sufficient on its
own to block the flow, and it is the same `_id`-type class recorded in earlier
rounds.

This matters well beyond the Trips page: trip distance is the input to fleet
fuel efficiency, cost-per-km, and the fallback distance the fuel KPIs use.
Which leads directly to §6.

Both handlers now use `driverRepository.findById`, which does the
`ObjectId.isValid` guard, the conversion and the tenant filter correctly.

---

## 5. The intelligence layer was never triggered

`AIPredictionTriggerHandler` read `payload.vehicleId` in all five branches.
**No domain event in this codebase has ever carried that field** — every one
sets `entityId` + `license_plate` (`FuelLoggedEvent`, `TripCreatedEvent`,
`VehicleUpdatedEvent`, `ReminderCreatedEvent`, `ReminderCompletedEvent`). The
`DigitalTwinProjectionHandler` sitting beside it already resolves the plate to
an id for exactly this reason.

So the real calls were `predictVehicle(undefined, tenantId)` and
`detectVehicleFraud(undefined, tenantId)`; `as string` made that compile; and
`.catch(() => undefined)` swallowed the result with no log, no metric and no
dead-letter entry.

**Predictive maintenance and fuel-fraud detection have never once been
triggered by an event.** They ran only when a user opened a screen that called
their API route directly.

Two branches were dead twice over: `TripCompleted` is a declared event name
that nothing publishes, and `MaintenanceCompleted` is not a registered event
name at all.

Fixed: resolves the plate through `vehicleIdentityResolver` (so an ambiguous
plate declines rather than attributing a fraud signal to an arbitrary
vehicle); uses `TripCreated`/`ReminderCompleted`, which are the events actually
published *and* the ones `bootstrap.ts` subscribes this handler to; keeps the
swallow (a prediction must never fail the write that triggered it) but
**logs** it. `ai-trigger-wiring.spec.ts` now asserts the handler's `case`
labels and `bootstrap.ts`'s `subscribe` calls are the same set in both
directions.

---

## 6. The fabricated metric in your live database

`FleetHealthService.calculateFleetMetrics`:

```ts
fuelEfficiencyAverage: totalFuel > 0 ? totalMileage / totalFuel : 0
```

`totalMileage` comes from **trips**. Trips are empty (§4). Fuel is not — you
have 40 logs. So efficiency evaluated to exactly `0`, which passes
`generateRecommendations`' `< 8` test, which persisted this into
`tblattentionitems`:

> **"Improve fleet fuel efficiency"** — *"Current fuel efficiency (0.0 km/L) is
> below optimal."* `estimatedCost: 1000`, `estimatedBenefit: 5000`, `roi: 5`

The measurement, the cost and the benefit were all derived from the **absence**
of data. The same `0.0` was printed into the ESG disclosure PDF, which is the
worse venue of the two.

Now `null` when it cannot be measured, with an explicit null guard on the
recommendation, the type nullable end-to-end (including the hand-maintained
frontend copy), and the PDF printing *"Not measured (no trip distance recorded
for this period)"*.

**"No trips recorded" and "this fleet achieves zero kilometres per litre" are
different statements and must not share a representation.**

---

## 7 & 8. Two more arithmetic defects in the same area

**`FuelFraudDetectionService.calculateBaseline`** computed distance by
**summing** odometer readings. An odometer is cumulative: ten readings from a
truck at ~84,000 km sum to ~840,000 "km", making `efficiency` a few hundred
km/L. In your data it fails the other way — rows carry `odometer: 0`, so
`|| 0` made the total exactly 0. Now `max − min` over readings that exist,
with `0` treated as "not recorded" rather than kilometre zero, and `null`
rather than `0` when it cannot be derived. The correct form already existed in
`FuelRepository.getFuelKPIs`; this brings the AI path into line rather than
inventing a third convention.

**`FleetHealthService.calculateFuelScore`** divided `fuel_volume / odometer` —
litres per kilometre — against a benchmark labelled `10 // km/L`. The
comparison ran backwards: a vehicle at 1 km/L scored 55, one at 10 km/L scored
51. **Worse economy scored higher.** And with `odometer: 0`,
`Math.max(1, 0 || 1)` made the denominator 1, so a 220 L fill produced a ratio
of 22, clamped to 1 — a **perfect 100**. Your Command Centre was showing fuel
health 100/100 and fuel efficiency 0.0 km/L on the same screen.

I fixed 7 and 8 **before** shipping 5. Switching a dead model on while its
arithmetic is wrong is worse than leaving it off.

---

## 9. Two registry ladders that could never run

`server/tenancy/module-scope.registry.ts` declares where each module's
`orgUnitId` comes from, and `scripts/backfill-org-units.ts` implements those
joins. Two declarations described migrations that cannot execute:

- **`inventory: 'workshop-bay'`** — the ladder joins on `bayId`. Neither
  `tblspareparts` nor `tblstockmovements` has that field. Every row resolved
  `no-reference` (fail-safe, assigned nothing, but the declaration was
  fiction).
- **`dispatch: 'vehicle'`** — a dispatch job is created *before* a vehicle is
  assigned (`status` starts `unassigned`), so there is nothing to join at
  write time.

Both corrected to `'explicit'`, which makes the backfill **report** rather than
guess. Both collections are currently empty, so refusing to guess costs
nothing.

**I did not build a new backfill script.** `scripts/backfill-org-units.ts`
(`npm run tenancy:backfill`) already has every property your brief asked for:
dry-run by default, `--confirm` to write, fills only a **missing** `orgUnitId`
(so it is idempotent and can never move a row between units), audits every
write to `tbltenant_repair_audit` so `npm run db:revert` can roll a run back,
and refuses to guess on `'explicit'`. A second one would have been the
duplicate-architecture problem your brief warns about.

---

## Verification — exact commands and results

Applied onto a **fresh unzip** of your upload, not my working copy.

```
npx tsc --noEmit -p tsconfig.json      →  0 errors          (baseline: 0)
TZ=Africa/Harare npx jest              →  111 suites / 2006 passed, 0 failed
                                          (baseline: 107 / 1932, 0 failed)
TZ=UTC npx jest                        →  111 / 2006, 0 failed
npm run test:security                  →  72 suites / 1134 passed, 0 failed
                                          (baseline: 70 / 1109)
npm run test:e2e                       →  1 suite / 14 passed
npm run test:performance               →  1 suite / 12 passed
npm run test:integration               →  1 suite skipped (needs a live Mongo)
npm run build                          →  ✓ 224/224 static pages, 102 kB shared
                                          (baseline: identical, 224 / 102 kB)
npm run lint                           →  24 findings, in the same 24 files as
                                          baseline — zero introduced
```

Both timezones were run deliberately: an earlier round shipped a day-boundary
bug that was green under `TZ=UTC` and red on your UTC+2 deployment.

`npm run build` was run on a throwaway copy with `next/font` stubbed, because
it fetches Geist from Google at build time and this sandbox has no egress to
fonts.googleapis.com. That stub is **not** in the delivered change set. The
baseline was built the same way, so the comparison is like-for-like.

**+74 tests across 4 new suites**, every one of which I confirmed fails on your
untouched tree.

---

## Manual steps you must run

1. **`npm run tenancy:backfill`** (dry run first, then `-- --confirm`).
   Historical rows written before these fixes still carry no `orgUnitId` and
   remain invisible to scope-narrowed users. The fixes stop the bleeding; this
   heals what already happened. Nothing was run against a database here —
   there is none in this sandbox.

2. **Resolve any duplicate plates before backfilling.** Writes against an
   ambiguous plate now return `409 VEHICLE_PLATE_AMBIGUOUS` rather than
   silently picking one. If you have duplicates, users will start seeing that
   error — which is the correct outcome, but it is a behaviour change.

3. **Expect fuel/efficiency figures to change.** Metrics that were reported as
   `0` now report "no data". Nothing regressed; the previous numbers were
   wrong. Driver-risk and fleet-health scores computed under the old fuel
   score are **not comparable** with new ones.

4. **Expect new AI activity.** Predictive maintenance and fuel-fraud detection
   now actually fire on `FuelLogged` / `TripCreated` / `ReminderCompleted` /
   `VehicleUpdated`. Watch load on first deploy — these were never running, so
   there is no production baseline for their cost.

---

## Remaining risks and open decisions

**Needs your decision, not mine:**

- **Fleet Health is a weighted blend of hard-coded benchmarks** — 10 km/L,
  $200 per expense, 100 km per trip, component weights of 0.25/0.20/0.15/…
  with no stated provenance, and `averageDowntime: 5, // Placeholder - needs
  real data` is a literal constant. I fixed the unit inversion inside it
  because that is a bug; I did **not** redesign the model, because what "good"
  means for your fleet is a product decision. Until it has a defensible basis
  I would not put this score in front of a technical evaluator.
- **`loadInScope*` fails OPEN on unassigned rows.** `fuel`, `expense`,
  `trip` and `reminder` single-record fetch/update/delete guard with
  `if (orgUnitId && !canAccess)` — so a row with **no** `orgUnitId` is
  reachable by any authenticated user with the permission, including for
  update and delete, while the list path hides it. Tightening it is a one-line
  change per file, but it would lock everyone out of every legacy row until
  the backfill runs. **Sequence: backfill first, then tighten.** I left it
  rather than hand you an outage.

**Known, unchanged:**

- Nothing auto-posts fuel/expense/maintenance costs into the **allocation
  ledger**. The cost-per-km engine exists and is tested; the ingestion pass
  that feeds it does not. Costs reach reporting and analytics, not the ledger.
- The `BaseRepository` `_id` type lie (declares `string`, Mongo returns
  `ObjectId`) is still live, with ~20 `updateOne({_id: doc._id})` call sites
  that would silently no-op if it were "fixed" in one shot. §4 is a symptom of
  the same root.
- `next/font` fetches from Google at build time — breaks air-gapped CI.
- Sentry is still non-functional (`@sentry/nextjs` v6 vs Next 15).
- 24 pre-existing lint errors.
- `MapsWidget` still renders a decorative static dot grid.

**Explicitly not done from your brief**, so you know what you are not getting:
telemetry→trip generation (Phase 6.1), route playback (6.4), the UI/UX and
navigation work (Phases 8–14), the platform-admin endpoints (Phase 4), and the
full documentation set (Phase 19) beyond `DATA_ENTRY_GUIDE.md`. Those are
substantial builds; I prioritised P0/P1 correctness and the dead connections,
per your own prioritisation rule.

---

## The honest answer to "what would still make me hesitate?"

If I were paying for this and comparing it against Cartrack or MiX, the
hesitation would not be feature coverage. It would be this: **until today, the
product's own intelligence layer was not running, and two of the numbers it
displayed were invented.** That is now fixed and pinned by tests — but the
class of defect it belongs to (a value that could not be computed being given
a number instead of an absence) is a *habit* in this codebase, not an incident.
`averageDowntime: 5 // Placeholder` is still sitting in the health score.

The single highest-value thing you could do next is a sweep for that pattern
specifically: every metric, every score, every benchmark — does it have a real
input, and what does it render when it does not? A fleet buyer will forgive a
missing feature. They will not forgive a dashboard that confidently told them
something untrue about their own trucks.
