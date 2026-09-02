# Fleet Leaderboard: missing backend aggregations

**Status: frontend built, backend not implemented.** Nothing in this doc
has been wired into `app/api/**` or `modules/**`. This is a spec for the
next backend change, not a description of shipped code. No backend
route, permission, response shape, or vehicle/driver assignment file was
added or modified for the Fleet Leaderboard.

Three of the seven alert-category tiles and one column of the vehicle
leaderboard ship **deliberately disabled** because the data behind them
cannot be read fleet-wide today. This document says exactly what was
searched, why the UI shows "unknown" rather than `0`, and what contract
would fill each gap.

---

## The rule the UI follows

A tile with no answer renders an em dash and the reason. It never
renders `0`.

On a tile, `0` and "we cannot find out" are the same pixels and opposite
facts. "0 geofence breaches this week" is a reassuring, false statement
to put in front of a fleet manager who is deciding whether to act. This
is the same rule the value ledger is built on — see
`modules/attention/types/value-ledger.types.ts`: *"NEVER FABRICATE A
ZERO. A source with no determinable amount produces no entry at all."*

Enforced in code by `AlertCategoryTileModel.count: number | null` and
asserted in `tests/unit/leaderboard/alert-category-utils.spec.ts`
("never returns a count on a tile whose state is not ready").

---

## Gap 1 — No fleet-wide telematics alert aggregation

**Affects:** the `Geofence` and `Low fuel` tiles, and the reason the
`Overspeed` / `Harsh braking` tiles are sourced from driver-risk metrics
rather than from the alert store itself.

### What was searched

The data exists. `TelematicsAlert`
(`modules/telematics/types/telematics.types.ts`) carries exactly the
categories this feature asks for:

```ts
type: 'speeding' | 'hard_brake' | 'hard_accel' | 'idle'
    | 'geofence' | 'engine' | 'maintenance' | 'vendor'
```

…and those rows are persisted into `tbltelematics_alerts` by
`telematicsService`, from two producers: `deriveReadingAlerts()`
(`modules/telematics/services/reading-alerts.ts`, which raises
`speeding` above 120 km/h and files low fuel below 10% under
`type: 'maintenance'`) and the geofence evaluator
(`telematics.service.ts:379`, `type: 'geofence'`).

What does **not** exist is any way to read them in bulk:

| Read path | Signature | Fleet-wide? |
| --- | --- | --- |
| `telematicsRepository.getActiveAlerts` | `(vehicleId, tenantId)` | No — one vehicle |
| `telematicsRepository.getActiveAlertsInScope` | `(vehicleId, context)` | No — one vehicle |
| `GET /api/telematics/vehicles/[vehicleId]/alerts` | one vehicle | No |
| `GET /api/telematics/live-map` | fleet-wide | Not alert rows — see below |
| `GET /api/observability/summary` | fleet-wide | No alert breakdown |
| `GET /api/analytics?action=…` | fleet-wide | KPIs, costs, fuel — no alerts |
| `GET /api/anomalies` | fleet-wide | Different collection; `fuel`/`expense`/`maintenance` only |

There is no grouped, counted, or batched read anywhere in
`modules/telematics/repositories/`. `reading-alerts.ts`'s own header
says so explicitly, while explaining why the live map derives alerts
from the latest reading instead:

> *"The live map returns up to MAX_LIVE_MAP_VEHICLES (500) vehicles per
> poll, every 10 seconds. `getActiveAlertsInScope` is keyed by a single
> vehicleId, so using it would add 500 queries per poll. There is no
> batched equivalent today."*

So a fleet-wide geofence count would be **one request per vehicle** —
500 requests to render one tile.

### What was deliberately not done instead

- **Counting `LiveMapVehicle.alert.reasons` from `GET /api/telematics/live-map`.**
  `reasons` is a deduplicated list of human-readable alert **messages**
  (`"Low fuel level: 8%"`), not types. Categorising it means
  substring-matching prose that exists to be read by a person, and any
  wording change silently zeroes the tile. It also counts **vehicles
  currently in a state**, not alert events over a period, so it answers
  a different question than the tile asks.
- **Showing `0`.** See "The rule the UI follows" above.
- **Adding the endpoint.** Out of scope by instruction.

### Suggested endpoint

Mirroring `GET /api/observability/telematics/providers` (the closest
existing "aggregate, don't list" read) for its route wiring, and
`getActiveAlertsInScope` for its scoping predicate.

#### `GET /api/telematics/alerts/summary`

**Permission:** `Permission.VEHICLE_VIEW` — the same gate
`GET /api/telematics/vehicles/[vehicleId]/alerts` already enforces.
Anyone who may read one vehicle's alerts may read a count of them.

**Scoping:** `resolveTenantContext(req)` only. Never a caller-supplied
org/tenant id. Apply `tenantScopeService.buildFilter(context, 'orgUnitId')`
exactly as `getActiveAlertsInScope` does.

> **Prerequisite.** `tbltelematics_alerts` rows written before BACKLOG
> ITEM 2 carry no `orgUnitId`, so an org-unit-scoped caller matches zero
> of them (fail-closed, never a leak, but a total loss of function).
> `npm run db:backfill-alert-orgunits` corrects historical rows and must
> have run before this endpoint returns trustworthy numbers for
> branch/fleet/workshop-scoped roles.

**Query parameters**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `from` | ISO 8601 date | now − 7d | Validate; reject `Invalid Date` with a 400 rather than letting Mongo silently match nothing (same bug class as `getVehicleAnalytics`). |
| `to` | ISO 8601 date | now | Must be ≥ `from`. |
| `includeAcknowledged` | boolean | `false` | Default matches `getActiveAlertsInScope`'s `acknowledgedAt: { $exists: false }`. |

**Response** (`successResponse(...)`, so the wire body is
`{ success, data, meta }` and `apiClient` unwraps to `data`):

```jsonc
{
  "generatedAt": "2026-09-02T09:00:00.000Z",
  "window": { "from": "2026-08-26T09:00:00.000Z", "to": "2026-09-02T09:00:00.000Z" },
  "byType": {
    "speeding":    { "count": 142, "vehicles": 23, "worstSeverity": "high" },
    "hard_brake":  { "count":  88, "vehicles": 19, "worstSeverity": "medium" },
    "hard_accel":  { "count":  61, "vehicles": 15, "worstSeverity": "medium" },
    "idle":        { "count":  30, "vehicles":  9, "worstSeverity": "low" },
    "geofence":    { "count":  12, "vehicles":  4, "worstSeverity": "high" },
    "engine":      { "count":   5, "vehicles":  3, "worstSeverity": "critical" },
    "maintenance": { "count":  17, "vehicles":  8, "worstSeverity": "high" },
    "vendor":      { "count":   2, "vehicles":  1, "worstSeverity": "medium" }
  },
  "topVehicles": [
    { "vehicleId": "…", "licensePlate": "AAA-111", "count": 31, "worstSeverity": "high" }
  ],
  "truncated": false
}
```

Design notes for whoever implements it:

- **One `$group` on `type`, one on `vehicleId`.** Two pipeline stages
  over an indexed `{ tenantId, orgUnitId, timestamp }` filter, not a
  fan-out. That is the entire point of the endpoint.
- **`byType` must be a total map over the union.** Emit every key with
  `count: 0` rather than omitting quiet types — here a `0` IS a
  measurement, because the endpoint looked and found none. The
  distinction the UI cares about is between "endpoint absent" (null) and
  "endpoint says zero" (0); once this ships, `0` becomes honest.
- **`vehicles`** is a distinct-vehicle count, so "142 speeding events
  across 23 vehicles" can be read at a glance without a second request.
- **`worstSeverity`** reuses the ordering in
  `reading-alerts.ts`'s `maxSeverity`, mirrored client-side in
  `frontend/modules/leaderboard/utils/leaderboard.utils.ts`.
- **Low fuel needs disambiguating.** `deriveReadingAlerts` files low
  fuel under `type: 'maintenance'`, so `byType.maintenance` mixes
  low-fuel and provider maintenance alerts. Either add a `'low_fuel'`
  member to the `TelematicsAlert['type']` union (additive; nothing
  switches exhaustively on it today, per that type's own comment) or
  return a separate `lowFuel` block keyed off
  `threshold === LOW_FUEL_THRESHOLD_PERCENT`. **The first is cleaner and
  is what the tile assumes.** Until then the Low fuel tile stays
  disabled rather than showing a maintenance count mislabelled as fuel.
- **`topVehicles` should be capped** (10–25) with `truncated` set, the
  same shape `LedgerExportData` already uses.

### Frontend change once it ships

Small and localised, in one file —
`frontend/modules/leaderboard/utils/alert-category.utils.ts`:

1. Flip `geofence` and `low_fuel` to `availability: 'supported'` and set
   their `sourceLabel`.
2. Optionally repoint `overspeed`/`harsh_braking` at `byType.speeding` /
   `byType.hard_brake` — a truer count than the driver-risk metrics
   (see Gap 3).
3. Add a `telematicsAlerts` field to `AlertCategoryInputs` and one case
   per tile in `buildAlertCategoryTiles`.

No component changes: `AlertCategoryTiles.tsx` already renders all four
states, and the `unsupported` styling disappears on its own once
`availability` flips.

---

## Gap 2 — Expense anomalies are not vehicle-attributable

**Affects:** the vehicle leaderboard's `Open alerts` metric, which
counts predictive-maintenance and fuel-fraud findings only.

### What was searched

`ExpenseAnomalyAlert` (`modules/ai/types/ai.types.ts`) carries:

```ts
entityId: string;                                    // the EXPENSE record's _id
entityType: 'vehicle' | 'organization' | 'driver';
```

`expense-anomaly-detection.service.ts`'s `createAlert` sets
`entityId: expense._id!` and derives `entityType = 'vehicle'` merely
*when the expense has a `license_plate`* — **but the plate itself is
never copied onto the alert.** So a consumer can learn that an anomaly
is *about some vehicle* and cannot learn *which one*.

The other two AI sources do not have this problem:
`PredictiveMaintenancePrediction` and `FuelFraudAlert` both carry
`vehicleId` **and** `licensePlate`.

Treating `entityId` as a vehicle id would join expense `_id`s against
vehicle `_id`s and produce a leaderboard of vehicles that do not exist.
Asserted in `tests/unit/leaderboard/leaderboard-utils.spec.ts` ("never
attributes an expense anomaly to a vehicle").

### Suggested change

Purely additive, on the alert shape — **no route, permission or existing
field changes**:

```ts
export interface ExpenseAnomalyAlert extends WithAIEvidence {
  // …existing fields unchanged…

  /** The vehicle this expense was booked against. Present only when entityType === 'vehicle'. */
  vehicleId?: string;
  /** Display plate for the above. Present only when entityType === 'vehicle'. */
  licensePlate?: string;
}
```

Populate from the expense row already in hand in `createAlert`
(`expense.license_plate`, plus a vehicle lookup for the id, or carry the
plate alone if the id costs a join). **Optional, not required** — an
organization-level expense genuinely has no vehicle, and an empty string
there would be worse than absence, per the platform's absent-vs-zero
convention (`cartrack-adapter-absent-vs-zero.spec.ts`).

Once present, `buildVehicleAlertRows()` gains a third loop and
`VehicleAlertLeaderboardRow` an `expenseAnomalyCount` field. Everything
else stays as it is.

---

## Gap 3 — Overspeed / harsh braking are driver-scoped, not alert-scoped

**Not a defect. A documented approximation, called out so nobody later
reads these two tiles as raw alert counts.**

The `Overspeed` and `Harsh braking` tiles sum
`DriverRiskScore.metrics.speedingEvents` / `.hardBrakes` across scored
drivers, from `GET /api/ai/dashboard`'s `driverRisk` panel. That figure
is real, fleet-wide, org-unit scoped, and costs no extra request — but
it differs from `tbltelematics_alerts` in three ways worth knowing:

1. **Window.** Driver-risk metrics are computed over the risk model's
   own lookback, not a caller-chosen `from`/`to`.
2. **Denominator.** Only *scored drivers* contribute. A speeding event
   on a vehicle with no identifiable driver is counted by the alert
   engine and not by this metric. The UI reflects this by summing over
   the same rows the driver leaderboard ranks — an unscored driver is
   excluded, never counted as zero.
3. **Threshold.** The risk model's speeding derivation and
   `SPEEDING_THRESHOLD_KMH = 120` in `reading-alerts.ts` are separate
   definitions that could drift.

When Gap 1 ships, repointing these two tiles at
`byType.speeding` / `byType.hard_brake` makes them exact. Until then
they are the honest approximation, and the tile's `sourceLabel` names
the field they come from so the provenance is visible in the UI, not
just in this file.

---

## What the leaderboard uses today (no gaps)

For completeness, everything the shipped UI reads — all existing,
all org-unit scoped server-side, all unchanged by this work:

| Feature | Endpoint | Permission |
| --- | --- | --- |
| Driver leaderboard (both metrics) | `GET /api/ai/dashboard` → `driverRisk` | `ANALYTICS_VIEW` |
| Vehicle leaderboard — open alerts | `GET /api/ai/dashboard` → `predictiveMaintenance` + `fuelFraud` | `ANALYTICS_VIEW` |
| Vehicle leaderboard — cost | `GET /api/reminders?action=most-expensive-vehicles` | `MAINTENANCE_VIEW` |
| Vehicle leaderboard — repairs | `GET /api/reminders?action=repair-frequency` | `MAINTENANCE_VIEW` |
| Overspeed / Harsh braking tiles | `GET /api/ai/dashboard` → `driverRisk[].metrics` | `ANALYTICS_VIEW` |
| Fuel fraud / Expense anomaly tiles | `GET /api/ai/dashboard` → batch findings | `ANALYTICS_VIEW` |
| Maintenance due tile | `GET /api/reminders?action=stats` → `overdue` | `MAINTENANCE_VIEW` |

Two notes on how these are read, both enforced in the unit tests:

- **Counting an AI batch.** The three batches on `/api/ai/dashboard` do
  not agree on what `success` means. `predictiveMaintenance` and
  `fuelFraud` push `success: false` when there is nothing to report, so
  `succeeded` is a finding count. `expenseAnomalies` pushes **every
  expense** with `success: true` and leaves `data` undefined for a clean
  one, so its `succeeded` is the number of expenses examined — reading
  it would report a fleet with 4,000 clean expenses as having 4,000
  anomalies. The only correct predicate across all three is
  `success === true && data !== undefined`, implemented once in
  `countBatchFindings()`.
- **Maintenance due counts `overdue` only.** `MaintenanceStats.pending`
  is every unresolved reminder due in the future with *no upper bound*,
  so summing the two would count a service booked for next year as "due"
  and put this tile permanently at odds with the Maintenance page's own
  overdue figure. `pending` is shown as a caption ("11 more scheduled
  ahead"), never added into the tile's number.
