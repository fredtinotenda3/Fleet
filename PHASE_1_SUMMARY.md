# Phase 1 — Telemetry Data Integrity

Implemented against the architecture audit, on top of Phase 0. This is the
operator-facing record: what changed, what you must run, and what is still
outstanding.

---

## Status

| Finding | Status |
|---|---|
| F-2 — Cartrack fabricated measurement zeros | **FIXED** |
| F-3 — Missing indexes, unique constraints and TTL | **FIXED** (one manual step) |
| F-18 — `Math.random()` in driver-incident severity | **FIXED** |
| Odometer overwrite guard | **FIXED** |
| Phase 0 regression | **PASSED** — 97/97 security tests |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **932 passed / 932, 59 suites** |
| Phase 0 baseline | 864 / 55 → **+68 tests, 0 regressions** |

---

## 1. F-2 — Missing is not zero

### What changed

`modules/telematics/adapters/cartrack/cartrack.adapter.ts` mapped every field
Cartrack does not supply to `0`. `telematics.types.ts` had been widened to make
those fields optional precisely to stop this; the Eagle Track adapter was
updated, Cartrack was not — so the two providers disagreed about what "no data"
means while writing into the same collection.

**What Cartrack actually supplies** (`cartrack.types.ts`): latitude, longitude,
speed, heading, `position_date`, `ignition_on`, and optionally `altitude`,
`odometer_km`, `fuel_level_percent`. Nothing else. Everything else is now
omitted rather than invented.

| Field | Before | After |
|---|---|---|
| `engine.fuelLevel` | `?? 0` | omitted unless reported |
| `engine.rpm` / `coolantTemp` / `throttlePosition` / `engineLoad` | `0` | omitted |
| `trip.odometer` | `?? 0` | omitted unless reported |
| `trip.tripDistance` / `tripDuration` | `0` | omitted |
| `trip.averageSpeed` / `maxSpeed` | instantaneous speed | omitted |
| `trip.idleTime` | `ignition && speed===0 ? 1 : 0` | omitted |
| `fuel.*` (all three) | `0` | omitted (`{}`) |
| `location.altitude` | `?? 0` | omitted unless reported |
| `location.accuracy` | `0` | omitted (Cartrack has no such field) |

Genuine zeros are preserved: a stationary vehicle really is doing 0 km/h, and an
empty tank really is 0%.

### Decisions worth knowing

**`averageSpeed` / `maxSpeed` are not mapped from `speed`.** Cartrack's status
payload is a point-in-time fix with no trip aggregation, so the old mapping
presented an instantaneous reading as two trip statistics — a vehicle sampled at
a red light reported a trip average of 0. Matches the decision already made for
Eagle Track's `/api2/last`.

**`idleTime` is omitted.** `ignition_on && speed === 0 ? 1 : 0` is a boolean
state written into a field the rest of the codebase reads as a *duration*, so
the accumulated figure measured how often we sampled rather than how long the
vehicle idled. The underlying fact is still recoverable from ignition + speed on
the reading.

**`TelematicsLocation.altitude` and `.accuracy` were widened to optional.** Both
adapters previously wrote `0`, justified on the grounds that neither is
surfaced in any UI. That argument is about display and does not survive
analytics: a stored `0` is a real value to anything that averages or thresholds
it. An `accuracy` of 0 is worse than wrong — it reads as a *perfect* fix, so any
future quality filter would preferentially keep the readings whose quality is
unknown.

### Why this mattered operationally

`fuelLevel: 0` satisfies the `< 10` branch in `deriveReadingAlerts`, so **every
Cartrack vehicle without a fuel sensor raised a high-severity "Low fuel level"
alert plus a fleet-manager notification on every poll**. That is an
alert-fatigue engine: it trains operators to ignore the channel.

`odometer: 0` did not merely display wrongly — it won over the vehicle's own
recorded odometer in the digital-twin fallback chain.

---

## 2. F-3 — Indexes, unique constraints and TTL

### ⚠️ MANUAL STEP REQUIRED BEFORE `npm run db:indexes`

The new unique index on `tbltelematics` **cannot be created while duplicate
readings exist**. MongoDB refuses, and duplicates are expected on any database
that ran the pre-Phase-1 code.

```bash
npm run db:dedupe-telemetry              # DRY RUN — reports, changes nothing
npm run db:dedupe-telemetry -- --apply   # execute
npm run db:indexes                       # then create the indexes
```

The script is idempotent and dry-run by default. It deletes only rows that are
duplicates *by the index key* and whose measured values are identical — i.e.
the same physical fix recorded twice. If two rows share the key but hold
**different** measurements it does not delete them; it reports them for review,
because that is a question for a human rather than something to resolve by
picking one at random. The earliest-inserted copy (lowest `_id`) survives.

`ensureIndexes()` now collects failures and prints a summary naming the remedy,
rather than logging one line and appearing to succeed.

### New indexes

**`tbltelematics`**
- `uniq_telematics_tenant_vehicle_device_ts` — **unique** on
  `{tenantId, vehicleId, deviceId, timestamp}`. Exactly the filter
  `bulkUpsertHistoricalReadings` uses. A Mongo upsert is only atomic against a
  unique index, so without this two concurrent backfills over the same window
  could both insert. Not partial — telemetry is append-only and never
  soft-deleted, so a partial index would leave every real row unconstrained.

**Six previously unindexed collections**, every index derived from a named call
site:

| Collection | Index | Why |
|---|---|---|
| `..._eagletrack_links` | **unique** `{tenantId, uin}`, partial on `isDeleted:false` | `mapByUin` keeps whichever duplicate came last, so a tracker could silently move to another vehicle between syncs |
| `..._eagletrack_links` | `{tenantId, orgUnitId, uin}` | `listInScope()` filter + sort |
| `..._eagletrack_triggers` | **unique** `{tenantId, providerTriggerId}`, partial | backs the upsert; a duplicate means one vendor trigger resolving to two geofences |
| `..._eagletrack_triggers` | `{tenantId, orgUnitId, typeCode, name}` | `listInScope()` filter + sort |
| `..._eagletrack_config` | **unique** `{tenantId}` | one config per tenant; prevents a second row appearing under a race and being silently ignored by `findOne` |
| `..._eagletrack_config` | `{enabled}` | `listEnabledTenantIds()` drives the cron |
| `..._cartrack_config` | same two | same reasoning |
| `..._demo_state` | **unique** `{tenantId}` | per-tenant demo throttle |
| `tblgeocode_cache` | **unique** `{tenantId, cell}` | the lookup key |
| `tblgeocode_cache` | **TTL** on `resolvedAt`, **90 days** | had no expiry of any kind |

### TTL rationale

Keyed on `resolvedAt` — there is no `createdAt` on `GeocodeCacheEntry`. Because
`put()` uses `$set: entry`, `resolvedAt` refreshes on every re-resolution, so
the TTL measures time since the address was last confirmed rather than since the
cell was first seen, which is what a cache wants.

**90 days**: reverse-geocoded addresses are near-static — roads are renamed and
premises change occupancy over months, not days. A stale entry costs an outdated
label on a map popup. Too short a TTL costs repeated calls to Nominatim, a free
public service used here with no API key and a strict usage policy, where
over-use risks the whole deployment being blocked.

`ensureIndexes()` did **not** pass `expireAfterSeconds` through before Phase 1,
so a declared TTL would have been created as an ordinary index — present,
correct-looking, and expiring nothing. Fixed, and pinned by a test.

---

## 3. F-18 — Deterministic driver-incident severity

`driver-risk.service.ts` classified every speeding incident with
`Math.random() > 0.7 ? 'High' : 'Medium'`. A driver's incident severity — an
input to a risk score that may inform employment decisions — was a coin flip,
and two managers reading the same driver on the same data saw different answers.

### The rule

```
speed >= SPEEDING_THRESHOLD_KMH + 20  ->  'High'
otherwise                             ->  'Medium'
```

`SPEEDING_THRESHOLD_KMH` (120) is **imported** from
`telematics/services/reading-alerts.ts` rather than restated, so the severity
band cannot drift from the threshold that decides whether an incident exists at
all.

Deliberately the simplest rule the data model supports. The only evidence a
`TelematicsEntity` carries about a speeding event is the road speed on the
reading — no speed limit for the road, no duration, no road class, no repeat
count, because readings are point-in-time fixes with no event aggregation. Any
richer rule would need inputs this codebase does not have, and inventing them is
what produced the defect being fixed.

**20 km/h over** is the point at which a reading stops being explicable as
flow-of-traffic or speedometer tolerance and becomes a deliberate choice. The
output domain is unchanged (`'High' | 'Medium'`), so nothing downstream changes
behaviour.

> **Consequence worth stating plainly:** incidents that were previously `'High'`
> 30% of the time at random are now `'High'` if and only if the vehicle was
> doing 140 km/h or more. **Risk scores computed under the old rule are not
> comparable with new ones.**

---

## 4. Odometer overwrite guard

`digital-twin.service.ts` resolved the odometer as
`latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0`. `??` only falls
through on null/undefined, so **any** telemetry value beat the vehicle record.
Fixing F-2 removes the fabricated zeros but not this — the *precedence* was
wrong.

Odometers go wrong in specific, well-known ways: a replacement head unit starts
from its own value; a CAN glitch emits an extra digit; a buffered device
reconnects and replays a month-old fix; a unit-conversion bug swaps miles and
kilometres.

### The rule — `modules/telematics/services/odometer-reconciliation.ts`

Telemetry is a **candidate**; the vehicle record is the **incumbent**. The
candidate wins only if it is plausibly a later reading of the same odometer:

| # | Condition | Outcome |
|---|---|---|
| 1 | absent, non-finite, or negative | keep incumbent (not flagged — most providers simply do not report one) |
| 2 | exactly `0` | **reject**, flag `zero` |
| 3 | no incumbent | accept, establish baseline |
| 4 | lower by more than `REGRESSION_TOLERANCE_KM` (1 km) | **reject**, flag `regression` |
| 5 | higher by more than `IMPLAUSIBLE_JUMP_KM` (5,000 km) | **reject**, flag `implausible-jump` |
| 6 | otherwise | accept |

**1 km tolerance** absorbs provider rounding (34853.05 vs 34853) without
admitting a real rollback, which is always orders of magnitude larger.

**5,000 km absolute ceiling, not a ratio.** A "> 2× last value" rule behaves
worst exactly where readings are least reliable: a new vehicle at 400 km
legitimately passes 800 km within a fortnight and would be rejected, while a
truck at 400,000 km would *accept* 799,000 km — an obvious garble — because it
falls under 2×. The ceiling is generous by design: a long-haul truck covers
~2,500 km/week and a device offline for a fortnight legitimately arrives with a
large gap. It exists to catch an extra digit and a units mix-up, not to police
normal operation.

Rejections raise a `medium` twin alert rather than being swallowed — "the
odometer stopped moving" and "we are refusing this device's readings" are
different operational situations. Severity is `medium`, not critical: the
platform is still using a known-good value, but a persistently-refused device
silently stops contributing distance, which quietly degrades cost-per-km.

`TwinCurrentState.odometerSource` (`'telemetry' | 'vehicle' | 'none'`) now
records which system supplied the number. `'none'` is distinct from 0 km.

**This is not a write path.** It decides which value to display and project; it
does not modify `tblvehicles`, and a rejected reading is still stored in
`tbltelematics` exactly as received — discarding raw provider data would destroy
the evidence needed to diagnose the device.

---

## Files changed

**New (6)**
```
modules/telematics/services/odometer-reconciliation.ts   the guard
scripts/dedupe-telemetry-readings.ts                     duplicate sweep (dry-run default)
tests/unit/telematics/cartrack-adapter-absent-vs-zero.spec.ts   16 tests
tests/unit/telematics/odometer-reconciliation.spec.ts           17 tests
tests/unit/ai/driver-risk-severity.spec.ts                       9 tests
tests/security/telematics-indexes.spec.ts                       26 tests
```

**Modified (9)**
```
modules/telematics/adapters/cartrack/cartrack.adapter.ts   F-2: omit, never fabricate
modules/telematics/adapters/eagletrack/eagletrack.adapter.ts  F-2: altitude/accuracy omitted
modules/telematics/types/telematics.types.ts               altitude/accuracy -> optional
modules/ai/services/driver-risk.service.ts                 F-18: deterministic severity
modules/digital-twin/services/digital-twin.service.ts      odometer guard wired in
modules/digital-twin/types/digital-twin.types.ts           + odometerSource
infrastructure/database/indexes.telematics-addendum.ts     F-3: unique tuple, 6 collections, TTL
infrastructure/database/indexes.ts                         expireAfterSeconds + loud failures
package.json                                               + db:dedupe-telemetry
```

## Deployment order

1. `npm ci`
2. `npm run db:dedupe-telemetry` — dry run, review output
3. `npm run db:dedupe-telemetry -- --apply`
4. `npm run db:indexes` — check the summary; a non-empty failure list means a
   constraint is **absent**
5. Deploy

Steps 2–4 are safe to run against a live database: the sweep deletes only
byte-identical duplicate readings, and index creation is `background: true`.
