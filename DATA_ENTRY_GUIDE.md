# Data Entry Guide — how to enter data so the connected modules actually work

This answers the question at the end of your brief: *"how to properly enter
data, if fuel how with connected modules etc"*.

Everything below is traced from the code in this repository, not from how a
fleet product generally works. Where a connection does not exist, or exists
but is not yet reliable, it says so.

---

## 1. The one rule that explains most "my data disappeared" reports

**A record's org unit is inherited from the vehicle, not from you.**

That is the deliberate design, and it is correct: if a Harare accountant
enters a fuel bill for a Bulawayo truck, the cost belongs to Bulawayo,
because Bulawayo's cost-per-km is what it changes. Attributing it to Harare
because Harare typed it in would corrupt both branches' numbers.

The consequence is the thing that surprises people:

> If you record a cost against a vehicle that is not in your branch, the
> record is filed under **that vehicle's** branch — and it immediately
> disappears from your own list.

As of this change set that is no longer silent. A scope-narrowed user who
names a vehicle outside their scope now gets `VEHICLE_NOT_FOUND` instead of
a `201` followed by an empty list.

The exception is records with **no vehicle** — drivers, workshop bays, spare
parts, dispatch jobs. Those have no asset to inherit from, so they take
**your own** org unit. If you have no org-unit assignment at all, creation is
refused with an explicit message, because there would be no correct unit and
the record would be invisible to everyone including you.

| Record | Org unit comes from |
|---|---|
| Fuel log, expense, trip, reminder, work order, DVIR, fuel card, booking | the **vehicle** |
| Driver, workshop bay, spare part, dispatch job | the **person entering it** |
| Stock movement | its **parent spare part** |
| Driver shift | the **driver**, falling back to the vehicle |
| Digital twin | the **vehicle** it projects |

---

## 2. Set-up order (do this once, in this order)

Each step is a hard prerequisite for the next — not a suggestion. Skipping
one does not produce an error; it produces a module that looks empty.

### 1. Organization and org units

`Administration → Organization`.

Create your branch/department/workshop/fleet tree first. Everything else
inherits from it, and a record created before its unit exists cannot be
retro-assigned without running the backfill script.

### 2. Assign every user to an org unit

`Administration → Organization → Members`.

A user with **no** assignment is fail-closed: they see nothing, and they
cannot create anything that has no vehicle. This is intentional, but it looks
like a broken account, so check it first when someone reports an empty screen.

Org-wide roles (owner, organization admin, super admin) have
`accessibleOrgUnitIds === null` and see everything. **This is why bugs in this
area survive demos** — whoever demos is usually an admin.

### 3. Vehicles

`Operations → Vehicles`.

The vehicle is the spine. Nothing that references a vehicle can be recorded
before it exists, because the write path resolves the plate first.

Two fields matter more than they look:

- **`license_plate`** is the join key for fuel, expenses, trips, reminders and
  work orders. It is matched **exactly**, case-insensitively (`AFU0078` does
  not match `AFU00781`). Nothing in the schema enforces uniqueness, and two
  active vehicles sharing a plate now cause a **refusal** (`409
  VEHICLE_PLATE_AMBIGUOUS`) rather than an arbitrary pick. Fix the duplicate
  before recording against it.
- **`odometer`** seeds the maintenance interval. See §4 for why leaving it at
  `0` breaks more than it appears to.

### 4. Drivers

`Operations → Drivers`.

Drivers take **your** org unit. If you are an org-wide admin you can file a
driver under a named branch; a branch manager cannot file one outside their
own scope.

### 5. Reference data

Fuel stations, fuel cards, expense types, units.

`tblunits` (litre, km) is **global reference data with no `tenantId`** — it is
shared across all tenants deliberately. Fuel stations and expense types are
organization-wide (shared across branches). Fuel cards are org-unit scoped and
inherit from their bound vehicle.

---

## 3. Recording a fuel log — the full picture

`Cost & Utilization → Fuel → Add fuel log`.

### What is required

| Field | Required | Notes |
|---|---|---|
| `license_plate` | yes | Must resolve to exactly one active vehicle **you can see** |
| `date` | yes | |
| `fuel_volume` | yes | > 0, ≤ 10,000 |
| `cost` | yes | ≥ 0 |
| `payment_method` | defaults to `cash` | `fuel_card` **requires** `fuel_card_id` |
| `unit_id` | optional | must exist in `tblunits` if given |
| `odometer` | optional | **see below — this is the important one** |
| `fuel_station_id`, `fuel_card_id`, `driver_id`, `tripId` | optional | each validated, tenant-scoped |
| `is_full_tank` | optional | |

`tripId`, if given, must belong to the **same plate** — a mismatch is refused
with `TRIP_VEHICLE_MISMATCH`.

### Enter the odometer. It is not optional in practice.

`odometer` is schema-optional, and your current `tblfuellogs` rows carry
`odometer: 0`. That single gap disables most of what the fuel module exists
to produce, because **fuel efficiency needs a distance, and distance comes
from the difference between two odometer readings**.

Without at least two real readings per vehicle:

- fuel efficiency (km/L) cannot be computed
- cost-per-km cannot be computed from fuel
- fuel-fraud detection loses its distance signal (its volume-anomaly signal
  still works — that one needs no odometer)
- the maintenance forecast has no mileage to project against

Before this change set, those did not report "no data" — they reported `0`,
and a `0` km/L was then treated as a *finding*. See §6.

**Practical rule: record the odometer on every fill, from the dashboard, and
mark `is_full_tank` when you fill to full.** Two consecutive full-tank fills
with odometer readings are what make a consumption figure trustworthy.

### What one fuel log actually sets off

The write is durable first, then `FuelLoggedEvent` is published. Every
consumer below is wrapped so it can never fail your save:

| Consumer | What it does | Status |
|---|---|---|
| `DigitalTwinProjectionHandler` | resolves the plate → updates the vehicle's twin (`fuel.lastFuelDate`, `lastFuelVolume`, `lastFuelCost`) | works |
| `AIPredictionTriggerHandler` | runs fuel-fraud detection for that vehicle | **fixed in this change set — was dead** |
| `IntelligenceHandler` | runs tenant-wide fuel anomaly detection | works |
| `NotificationHandler` | notifies subscribed users | works |
| `AnalyticsHandler` | invalidates cached analytics | works (its cache-key bug was fixed in an earlier round) |
| `WorkflowTriggerHandler` | fires any workflow with a `fuel.logged` trigger | works |
| `WebSocketHandler` | pushes `fuel:logged` to connected clients | works |

Not wired, and honestly out of scope for a fuel log: nothing posts a fuel cost
into the **allocation ledger** automatically. Finance's cost-per-km engine
exists and is tested, but the ingestion pass that posts fuel/expense/
maintenance into it has not been built. Fuel costs reach reporting and
analytics; they do not yet reach the ledger. This is recorded as a gap rather
than papered over.

---

## 4. Trips — and why yours are empty

`tbltrips` has **zero rows**, and one reason is a defect fixed in this change
set: both trip handlers validated the driver with

```ts
findOne({ _id: validated.driver_id as any })
```

— a **string** compared against an ObjectId `_id`. Mongo does not coerce
between the two, so the lookup always failed and **every trip that named a
driver was rejected with `DRIVER_NOT_FOUND`**. The `as any` is what let it
compile.

This matters beyond the Trips page, because trip distance is the input to:

- fleet fuel efficiency (`totalMileage / totalFuel`)
- cost-per-km
- the fallback distance the fuel KPIs use when odometer readings are missing
- utilisation

**A trip needs `start_odometer` and `end_odometer`, or an explicit
`trip_distance`.** Without one of those the trip carries no distance and
contributes nothing downstream, even though it saves successfully.

---

## 5. The other modules, briefly

**Expenses** — same shape as fuel: plate resolves the vehicle, expense inherits
its unit. Spreadsheet import previously wrote **no** `orgUnitId` at all, so
every imported expense was invisible to every scoped user. Fixed.

**Maintenance reminders** — inherit the vehicle's unit. Driven by `due_date`
and by odometer against `service_interval`, so §3's odometer point applies
here too.

**Work orders** — inherit the vehicle's unit; parts consumed decrement
inventory and record a stock movement against the part's unit.

**Dispatch** — a job is raised **before** a vehicle is assigned, so it takes
your unit and **keeps** it. It is deliberately not re-homed to the vehicle's
branch at assignment: moving a live job between branches would remove it from
the board of the dispatcher running it.

**Drivers → shifts** — a shift inherits the driver's unit, falling back to the
assigned vehicle's. The driver is now validated (it previously was not).

---

## 6. Things the platform will no longer tell you

Two numbers were being invented, and both are worth knowing about because you
have seen them:

1. **"Current fuel efficiency (0.0 km/L) is below optimal"**, sitting in your
   `tblattentionitems` with a $1,000 estimated cost and a $5,000 estimated
   benefit. Trips are empty → `totalMileage` is `0` → efficiency computed as
   `0` → `0 < 8` → item raised. The figure and both money values were derived
   from the *absence* of data. Efficiency is now `null` when it cannot be
   measured, the recommendation is guarded against null, and the ESG PDF
   prints "Not measured" instead of `0.0`.

2. **Fuel health scored 100/100 on the same screen.** `calculateFuelScore`
   divided `fuel_volume / odometer` — litres per km — against a benchmark
   labelled km/L, so worse economy scored *higher*; and with `odometer: 0` the
   denominator became `1`, producing a perfect score. It now measures km/L
   properly and returns the scale's neutral 50 when it cannot measure at all.

**If a number cannot be computed, you should now see "no data" rather than a
zero.** Treat any remaining zero on a metric you know you have no inputs for
as a bug worth reporting.

One thing deliberately *not* changed: the wider Fleet Health score is a
weighted blend of hard-coded benchmarks (10 km/L, $200 per expense, 100 km per
trip) with no stated provenance. That is a product decision about what "good"
means for your fleet, not a bug, and it is recorded in the findings document
for you to decide rather than settled inside a bug fix.

---

## 7. If a screen is empty, check these in order

1. **Is the user assigned to an org unit?** No assignment = sees nothing, by
   design.
2. **Was the record created before its org unit existed, or before these
   fixes?** Historical rows carry no `orgUnitId` and are invisible to
   scope-narrowed users. Run the backfill:
   ```bash
   npm run tenancy:backfill              # dry run, changes nothing
   npm run tenancy:backfill -- --confirm # commit
   ```
   It only ever fills a **missing** `orgUnitId`, never moves an existing one,
   and writes every change to `tbltenant_repair_audit` so
   `npm run db:revert` can roll the run back.
3. **Does the vehicle have an org unit?** A vehicle with none is invisible to
   every scope-narrowed user, and so is everything that inherits from it.
4. **Are you comparing against an admin's view?** An org-wide role sees
   everything, so "it works for me" from an admin proves nothing about a
   branch manager's screen.
