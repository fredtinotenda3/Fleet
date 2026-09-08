# Data Structure Reference

Collections, canonical identifiers, relationships and the data flows that
connect them. Written from the code and from a live schema export, not
from the type definitions alone — where the two disagree, that is noted.

---

## 1. Canonical identifiers — read this first

This is the single most common source of defects in this codebase.

| Identifier | What it is | Where it is used |
|---|---|---|
| `tenantId` | the organization **slug** (`willsgrove-farm-enterprises-9e80ed`) | every row |
| `orgUnitId` | `String(orgUnit._id)` | every org-unit-scoped row |
| `vehicleId` | the vehicle's Mongo `_id` | finance, AI, telemetry, digital twin, generated trips |
| `license_plate` | human-facing, **mutable**, **not unique** | fuel, expenses, trips, reminders, work orders |
| `driverId` / `driver_id` | the driver's Mongo `_id`, **as a string** | trips, fuel logs, shifts |

### The trap

**Operational records join on `license_plate`. Finance, AI and telemetry
join on `vehicleId`.** They are different keys for the same thing, and
nothing in the schema enforces plate uniqueness.

Real defects this has caused:

- Ten write paths resolved a plate with **no `tenantId` filter**, so a
  plate collision across tenants filed a cost under a foreign org unit.
- `AllocationPosting.vehicleId` expects an `_id`; passing a plate
  compiles, validates, writes, and returns an empty cost report forever.
- Trip handlers compared a **string** `driver_id` against an ObjectId
  `_id`, so every trip naming a driver was rejected.

**Use `vehicleIdentityResolver`** (read) or `vehicleWriteResolver`
(write). Never re-derive the lookup.

### `_id` is declared as `string` and is an `ObjectId`

`BaseRepository` casts `toArray() as unknown as Promise<T[]>`. Roughly 20
call sites do `updateOne({_id: doc._id})` and would silently no-op if
this were "fixed" in one pass. Use `findById(id, tenantId)`, which does
the `ObjectId.isValid` guard and the conversion.

---

## 2. Core collections

### `tblvehicles`
The spine. `license_plate` (uppercased), `make`, `model`, `year`,
`vehicle_type` (**free text** — real data contains `"      DAF          "`),
`status`, `odometer`, `service_interval`, `orgUnitId`, `tenantId`.

### `tbldrivers`
`name`, `email`, `phone`, `driver_code`, `license_number`,
`license_expiry`, `status`, `orgUnitId`.

> **Historical note.** Most existing rows carry no `status` field at all,
> so `DriverRepository.buildStatusCondition` treats "active" as
> *explicitly active OR field absent*. And until recently no row carried
> `orgUnitId` — see §7.

### `tbltrips`
`license_plate`, `date`, `distance_calculated` (**required**),
`mode` (`distance` | `odometer`), `unit_id`, `start_odometer`,
`end_odometer`, `start_time`, `end_time`, `duration_minutes`,
`average_speed`, `driver_id`, `status`, `created_from`, `orgUnitId`.

Telemetry-generated trips additionally carry (see
`shared/types/trip.generation-addendum.ts`):

| Field | Meaning |
|---|---|
| `generation_key` | `<tenantId>:<vehicleId>:<startAt ISO>` — idempotency |
| `generation_vehicle_id` | the vehicle `_id`, so playback needs no plate lookup |
| `generation_end_reason` | `ignition-off` \| `stopped` \| `signal-gap` |
| `distance_km_known` | **false** when `distance_calculated` is a placeholder `0` |
| `distance_source` | `odometer` \| `gps-path` \| `null` |
| `max_speed`, `start_lat/lng`, `end_lat/lng` | telemetry detail |

> `distance_calculated` is a required number, so an unmeasurable trip
> stores `0` there — and `distance_km_known: false` records that the `0`
> is an *absence*. Anything that averages distance must filter on the
> flag. This is the one place the codebase's "never write 0 for unknown"
> rule is bent, and it is bent because the field is non-optional in a
> shipped schema.

### `tblfuellogs`
`license_plate`, `date`, `fuel_volume`, `unit_id`, `cost`, `currency`,
`odometer`, `payment_method`, `fuel_station_id`, `fuel_card_id`,
`driver_id`, `tripId`, `is_full_tank`, `orgUnitId`.

> **`odometer: 0` means "not recorded", not kilometre zero.** Real rows
> carry it. Every consumer must exclude zeros before computing a
> distance, or the delta becomes the vehicle's lifetime mileage.

### `tblexpenses`
`license_plate`, `amount`, `currency`, `date`, `expense_type_id`
(**ObjectId**, not a string), `description`, `jobTrip`, `tripId`,
`orgUnitId`.

### `tblreminders` / `tblmaintenance`
`license_plate`, `title`, `due_date`, `completion_date`, `status`,
`priority`, `service_type`, `estimated_cost`, `orgUnitId`.

> There is **no actuals cost field**. `estimated_cost` is the only cost
> signal, which is why allocation postings from maintenance are labelled
> "estimated cost — no actuals recorded".

### `tblworkorders`
`license_plate`, `title`, `status`, `priority`, `reminderId`,
`assignedMechanicId`, `bayId`, `partsUsed`, `partsCost`, `laborCost`,
`totalCost`, `completedAt`, `source`, `dvirInspectionId`, `orgUnitId`.

---

## 3. Telemetry

### `tbltelematics` — raw readings
`vehicleId`, `deviceId`, `timestamp`, `location{lat,lng,speed,heading?}`,
`engine{...}`, `trip{odometer?,...}`, `fuel{...}`, `providerMetadata`,
`orgUnitId`, `tenantId`.

**Every member of `engine`, `trip` and `fuel` is optional and must stay
that way.** A fabricated `0` is indistinguishable from a real reading of
zero: `fuelLevel: 0` raises a low-fuel alert on every poll;
`trip.odometer: 0` *wins* over the vehicle's real odometer in the digital
twin's fallback chain; `heading: 0` points every non-reporting vehicle
due north.

Indexes: `{tenantId, vehicleId, timestamp}`,
`{tenantId, deviceId, timestamp}`, unique
`{tenantId, vehicleId, deviceId, timestamp}`, TTL on `createdAt`.

> **Ignition** has no first-class field on the persisted reading. The
> canonical provider type has `engine.ignition`; the persisted shape
> drops it. `extractIgnition()` reads `engine.ignition`, then
> `providerMetadata.ignition` (boolean or the vendor's raw `1`/`0`), and
> returns `undefined` when neither is present. **`undefined` means
> "unreported", not "off"** — treating it as off would end every trip on
> its first reading.

### `tbltelematics_daily_rollup`
Per-vehicle-day aggregates that outlive the raw TTL. Days are **UTC
everywhere** — a server-local `setHours(0,0,0,0)` shipped a bug that was
green in UTC and red on a UTC+2 deployment.

### `tbltrip_detection_state`
One document per `{tenantId, vehicleId}`: the trip-generation watermark
(`lastProcessedAt`) and any in-flight `open` trip. Platform-level
bookkeeping, no read API.

> **Must be cleared whenever `tbltrips` is cleared.** Otherwise every
> watermark sits in the future, the sweep skips all existing telemetry,
> and no trips are ever regenerated — silently.

---

## 4. Finance

### `tblallocationledger` — **append-only**
`vehicleId` (an `_id`), `driverId?`, `costCategory`, `allocationRule`,
`sourceCollection`, `sourceId`, `periodStart/End`, `currency`, `amount`,
`fxRate`, `fxRateDate`, `fxSource`, `reportingCurrency`,
`reportingAmount`, `idempotencyKey`, `orgUnitId`.

`sourceCollection` ∈ `tblexpenses` | `tblfuellogs` | `tblreminders` |
`tblworkorders` | `finance:depreciation` | `finance:shared-cost`.

Idempotency: `sha256(tenantId ␀ sourceCollection ␀ sourceId ␀ costCategory)`,
enforced by a **partial unique index** on `idempotencyKey`.
`costCategory` is in the key because one source can legitimately produce
several postings — a work order is parts *and* labour.

> **Two period semantics exist.** `buildFilter` (the LIST endpoint) is
> *starts-within-window*; `getNetTotalsBy*` (the MONEY paths) are
> *fully-contained*. For a posting spanning a boundary the drill-down
> will not add up to the header. All money paths use the totals methods.
> Standardising on fully-contained is recommended, in its own commit.

### `tblvalueledger`, `tbldepreciationprofiles`, `tblglsubmissions`
Realised value, per-vehicle depreciation policy, and GL reconciliation
submissions respectively.

---

## 5. Organization and access

`tblorganizations` (members roster, subscription, settings, branding),
`tblorgunits` (the tree — `parentId`, `path[]`, `depth`, `type`),
`tbluser_scope_assignments` (user → org unit → role), `tbladmin`
(accounts), `tblcustomroles`, `tblresourcepermissions`, `tblapikeys`.

`ALLOWED_PARENT_TYPES` governs the hierarchy: Branch → Department →
Workshop → Fleet.

---

## 6. Data flows

### Recording a fuel log

```
POST /api/fuel
  → vehicleWriteResolver.resolveForWrite(plate, userWriteScope(context))
      ├─ tenant-scoped, org-unit checked, ambiguous plate refused
      └─ the fuel log inherits the VEHICLE's orgUnitId
  → write
  → FuelLoggedEvent { license_plate, cost, fuel_volume, odometer, date, currency }
      ├─ DigitalTwinProjectionHandler   → resolves plate → updates the twin
      ├─ AIPredictionTriggerHandler     → fuel-fraud detection for that vehicle
      ├─ AllocationPostingHandler       → posts cost into the allocation ledger
      ├─ IntelligenceHandler            → tenant-wide fuel anomaly detection
      ├─ NotificationHandler            → notifies subscribers
      ├─ AnalyticsHandler               → invalidates cached analytics
      ├─ WorkflowTriggerHandler         → fires `fuel.logged` workflows
      └─ WebSocketHandler               → pushes `fuel:logged`
```

### Telemetry → trips → cost per km

```
provider.syncTenant()
  → telematicsService.ingestTelematicsData()   → tbltelematics
  → [scheduled, every 10 min] generate-trips
      → detectTrips(readings, watermark)        (pure; ignition / movement / gap)
      → tbltrips  (created_from: 'gps', idempotent on generation_key)
      → TripCreatedEvent → maintenance forecasting
  → trip distance feeds fleet efficiency, utilisation and cost-per-km
  → GET /api/trips/:id/playback replays the readings between start and end
```

### Cost per km

```
distance   ← trips (distance_km_known === true only)
cost       ← tblallocationledger, in the reporting currency
costPerKm  ← null at zero distance, never 0
```

---

## 7. Historical data notes (this deployment)

These are facts about the live database, not the schema:

- **`tbldrivers` rows carry no `orgUnitId`.** Every driver was invisible
  to every scope-narrowed user until this was fixed. Run
  `npm run tenancy:backfill`.
- **`tblfuellogs` rows carry `odometer: 0`** — fuel efficiency cannot be
  derived from them.
- **`tbltrips` is empty.** One sufficient cause: trip creation rejected
  every trip naming a driver (§1).
- **`tblvehicledigitaltwins` has 177 rows with no `orgUnitId`.**
- **Two organizations are both named "Toyota Zimbabwe"** with distinct
  slugs. They must never be merged, and plate collisions between them are
  realistic.
- **`tblexpense_types` is a global catalogue with no `tenantId`.**
  Re-seeding it changes every category id on every existing expense.

---

## 8. Status enums

| Field | Values |
|---|---|
| `Vehicle.status` | `active` \| `inactive` \| `maintenance` \| `sold` |
| `Driver.status` | `active` \| `inactive` \| `suspended` (often absent) |
| `Trip.status` | `planned` \| `ongoing` \| `completed` \| `cancelled` |
| `Reminder.status` | `pending` \| `completed` \| `overdue` |
| `WorkOrder.status` | `open` \| `assigned` \| `in_progress` \| `completed` \| `cancelled` |
| `DispatchJob.status` | `unassigned` \| `assigned` \| `en_route` \| `in_progress` \| `completed` \| `cancelled` |
| Alert severity | `low` \| `medium` \| `high` \| `critical` |
| `AllocationCostCategory` | `fuel` \| `maintenance` \| `expense` \| `depreciation` \| `insurance` \| `other` |
