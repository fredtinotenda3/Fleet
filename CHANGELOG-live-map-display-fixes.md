# Live-map display fixes — status logic, alert state, marker styling, missing telemetry

**Scope:** the live fleet map (`/telematics/map`), its vehicle detail panel, and the
Eagle Track reading mapper that feeds them.

**Untouched, as required:** Eagle Track authentication and token handling
(`eagletrack-api.client.ts`, `eagletrack-config.repository.ts`), the sync flow
(`syncOrganization`, `ingestStatus`, `deriveEagleTrackUsername`), vehicle matching
(`plateCandidatesFromTracker` and its ordering), the Cartrack adapter, all
multi-tenancy / org-unit scoping, and demo-mode architecture. Every scoped
repository call in `LiveMapService` is byte-identical to before; the 38-suite
security set still passes at the same count.

---

## 1. Status logic

`live-map.service.ts` computed status as
`ageMinutes > STALE_FIX_MINUTES ? 'offline' : statusFromSpeed(...)` in **two**
places (`resolveRealVehicle` and `toVehicleDetail`). Any fleet whose trackers
report on a duty cycle slower than 15 minutes rendered as 100% offline.

Replaced with one exported pure function, `resolveLiveStatus()`, used by both
call sites so the marker and the panel cannot disagree about the same vehicle:

```
offline  if  no position
         OR  provider's own `offline` flag === true
         OR  fix age > OFFLINE_FIX_MINUTES (60)

otherwise  moving  if speed > IDLE_SPEED_THRESHOLD_KMH (3)
           idle    otherwise
```

**Offline is a disjunction, and that is load-bearing.** Because the three
conditions are OR-ed, their order carries no meaning and cannot be got subtly
wrong in a later edit. It also settles the one genuine conflict in the inputs: a
vendor flag can only ever *add* offline, never remove it, so a provider reporting
`offline: false` on an hours-old snapshot cannot make that snapshot live. The age
ceiling is what prevents the opposite failure from the one being fixed — a
tracker that dies mid-journey keeps replaying its last snapshot with a non-zero
speed, and a "speed beats age" rule alone would show it as actively moving at a
frozen location forever.

`STALE_FIX_MINUTES` (15) survives as a **secondary indicator only** and appears
nowhere in `resolveLiveStatus`. It now drives a new `stale: boolean` on
`LiveMapVehicle` / `LiveMapVehicleDetail`, surfaced as a "Stale fix" chip beside
the real status in the panel, the vehicle list and the marker tooltip.

**On the provider flag in practice:** `ingestStatus` skips a snapshot whose fix it
already holds, so a tracker that goes quiet stops producing rows and the stored
reading keeps whatever `offline` value it had when last written. The vendor flag
is therefore a bonus signal when present and fix age does most of the work —
which is exactly "prefer the provider's own field when available", no more.

New: `readProviderOffline()` narrows `providerMetadata.offline` defensively.
`undefined` ("the provider did not say") is deliberately not conflated with
`false` ("the provider said online"); only an explicit `true` acts.

## 2. Alert state

New `alert: LiveMapAlertState | null` **alongside** `status`, not inside it.

`LiveMapVehicleStatus` stays `moving | idle | offline`. Adding an `'alert'` member
would have silently broken every consumer that buckets a fleet by status —
`MapsWidget` counts moving + idle + offline and expects them to sum to the fleet
total, so alerting vehicles would have vanished from all three. Keeping it
separate also means a red marker **keeps its heading wedge** instead of losing the
direction information.

`resolveAlertState()` derives from the latest reading, three sources, zero extra
queries:

1. `deriveReadingAlerts()` — the same speeding / DTC / low-fuel rules the
   ingestion path uses to *create* alerts, so a red marker means the same thing
   as a row in `tbltelematics_alerts`.
2. Unacknowledged alerts embedded on the reading itself.
3. The provider's own `alert.cmd` / `alert.trigger`, surfaced at `medium` as an
   unmapped vendor alert rather than being assigned a severity we have no basis
   for. The vendor's `0/0` resting state is ignored.

Worst severity wins; reasons are deduplicated and ordered worst-first.

**New file `modules/telematics/services/reading-alerts.ts`.** `checkForAlerts` was
private to `TelematicsService`; it is now a pure exported function that the
service delegates to unchanged. Behaviour is identical — the point is that the
thresholds now live in exactly one place instead of being copied into the map.

## 3. Alert store — not used, and why (item 5 confirmed)

`telematicsRepository.createAlert` inserts
`{ vehicleId, ...alert, tenantId, createdAt, isDeleted }` and **no `orgUnitId`**,
while `getActiveAlertsInScope` applies the standard org-unit predicate. For any
org-unit-scoped caller that predicate matches zero rows — the alert store cannot
answer "is this vehicle alerting" for exactly the users the live map is scoped
for.

That direction is **fail-closed**, so it is not a leak and nothing here is urgent.
It is left alone deliberately: fixing it means changing the alert *write* path and
backfilling existing rows, which is a separate change with its own migration. The
second, independent reason not to use it: the map returns up to 500 vehicles every
10s and `getActiveAlertsInScope` is keyed by a single `vehicleId`, so it would be
500 queries per poll with no batched equivalent available. Both reasons are
recorded in `reading-alerts.ts`'s header.

## 4. Marker styling

Four separate defects, all fixed:

**`var()` inside SVG presentation attributes.** Markers used
`fill="var(--success, #16a34a)"`. That puts a CSS function in an XML presentation
attribute, which browsers do not reliably resolve. Colour is now applied as a real
CSS declaration — `style="color: var(--map-marker-moving)"` on the wrapper,
`style="fill: currentColor"` on the shapes. Chosen over resolving hex values in JS
because it keeps following the theme through a dark-mode toggle with no observer
wiring.

**Cascade order.** `app/layout.tsx` imported `globals.css` *before*
`leaflet.css`, so Leaflet's stylesheet won every specificity tie — this is the
"overridden by Leaflet's default marker styles" symptom. New
**`app/leaflet-overrides.css`**, imported immediately *after* `leaflet.css`. Moving
that import above the Leaflet one silently reverts the fix; the file says so in
its header. Everything in it is scoped to an explicit `fleet-` class.

**Tailwind v3 syntax on a v4 project.** The marker tooltip carried
`!border-0 !shadow-none !p-0` — v4 uses a *trailing* `!`, so those three classes
generated no CSS and Leaflet's white box, border, shadow and `::before` arrow were
never removed. Replaced with real CSS on `.fleet-map-tooltip`, which also removes
the version dependency and is the only way to reach the pseudo-element.

**Heading wedge.** Now drawn whenever a heading is actually available, not only
when `status === 'moving'`. Suppressed for offline vehicles, whose last-known
bearing describes where they *were* pointing. `heading` is optional end to end, so
a device that reports no bearing gets a plain disc rather than an arrow pointing
due north.

Palette (`:root` custom properties, one place to retune):

| state   | token                          | colour       |
|---------|--------------------------------|--------------|
| moving  | `--map-marker-moving`          | `--success` green |
| idle    | `--map-marker-idle`            | `--warning` amber |
| offline | `--map-marker-offline`         | `--fleet-offline` grey |
| alert   | `--map-marker-alert`           | `--danger` red |

Offline uses the *fixed* `--fleet-offline` rather than `--muted-foreground`,
because OSM raster tiles stay light whatever the app theme is and a theme-reactive
grey washes out in dark mode. The legend and the vehicle list reference the same
custom properties, so they cannot drift from what the map draws.

Also: `divIcon` now carries an explicit `fleet-vehicle-marker` class (something to
target if a future Leaflet changes its `leaflet-div-icon` default); markers get
`role="img"` + `aria-label` carrying plate, status, alert and staleness; the
selected-vehicle halo honours `prefers-reduced-motion`; and interpolated plates
are HTML-escaped, since the marker is assembled as a string from tenant data.

Corrected a false comment in `LiveMapLeaflet.tsx` claiming it imports
`leaflet/dist/leaflet.css`. It never did.

## 5. Missing telemetry fields

`eagletrack.adapter.ts` wrote `?? 0` for absent signals. The detail panel has
*always* rendered "No data" for an absent field — it was never being given one. A
tracker with no OBD/CAN wiring reported "0 rpm", "0°C" coolant, "0% throttle",
"0% engine load", "0.0 L" fuel used: readings that look like a seized engine
rather than a device with no engine bus attached.

Now omitted when unreported: `rpm`, `coolantTemp`, `throttlePosition`,
`engineLoad`, `tripDistance`, `tripDuration`, `odometer`, `consumptionRate`,
`instantConsumption`, `fuelUsed`, `heading`. `fuelLevel` was already correct.

**Two consequences beyond display, both fixed by the same change:**

- **`trip.odometer: 0` was corrupting the digital twin.**
  `digital-twin.service.ts` resolves odometer as
  `latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0` — a written `0` wins
  that chain and replaces the vehicle's real recorded figure. Omitting it restores
  the fallback. This is what item 4's "preserve existing fallback logic" required
  and it is covered by a test.
- **`averageSpeed` / `maxSpeed` were set to the instantaneous speed** of a single
  snapshot. `/api2/last` carries no trip aggregation at all, so labelling one
  sample as a trip average or maximum was a category error, not a rounding one.
  Both omitted. `GET /api2/history` would be the honest source and remains out of
  scope (see the adapter header).

`heading` gets no `?? 0` fallback because 0° is due north — a legitimate bearing —
so substituting it made every non-reporting vehicle's arrow point the same
confidently-wrong way, indistinguishable from a real northbound fix.

**Battery voltage, GSM signal, GPS satellites.** GSM and satellites already
degraded correctly. Battery *voltage* was not surfaced at all: it lives in
`providerMetadata.io` (io 176 device battery, io 179 vehicle supply) and is now
read into `deviceHealth.batteryVoltage` / `powerVoltage`. They are two different
batteries and are shown as separate rows, not merged. The key is derived through
`describeIoCode()` rather than hardcoded as `'Battery'`, so renaming a code in the
catalogue cannot silently turn this into a permanent "No data".

`VehicleDetailPanel` gained a `num()` helper. A reported `0` still renders "0%" —
only `undefined` becomes "No data". There is no `?? 0` anywhere in that file; one
would collapse the two back together and undo the change.

**Types widened** (`TelematicsData`): all members of `engine`, `trip` and `fuel`,
plus `TelematicsLocation.heading`. The container objects stay required so existing
`data.engine?.x` readers keep their shape. The HTTP ingest schema
(`telematics.schema.ts`) still *requires* these, so only provider adapters can
omit them — the same precedent `engine.fuelLevel` already set.
`TelematicsEntity.trip.idleTime` in `ai.types.ts` widened to stay assignable;
`driver-risk.service.ts` already read it as `t.trip?.idleTime || 0`, so no
consumer behaviour changes.

**Historical rows are not migrated and do not need to be.** Rows already written
with fabricated zeros keep them, but the live map and detail panel read the
*latest* row per vehicle, so the display self-heals after the next sync cycle. No
backfill script is included; flag it if you want the history cleaned.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (baseline: 0) |
| `npx jest` | **672 / 674 passing, 45 suites** (baseline 637 / 639, 44 suites) — **+35 tests**, 2 failures both pre-existing |
| `npm run test:security` | **497 / 499, 37 of 38 suites** (baseline 491 / 493) |
| `npm run build` | **clean — 210 static pages, 0 errors** |

**The 2 remaining failures are the known pre-existing ones**, unrelated to this
work and present in the archive as uploaded:
`tests/security/predictive-maintenance-consolidation.spec.ts` asserts that
`modules/intelligence/services/predictive-maintenance.service.ts` has been
deleted, and it is still on disk. Nothing imports it except the test that wants it
gone. It has been in `DELETED_FILES.txt` since an earlier round — applying that
deletion is what turns `npm run test:security` fully green, and it is the only
thing standing between you and a clean security run.

**On the build:** `npm run build` fails in this sandbox at `next/font` fetching
Geist from Google *before* compiling any app code, so a red build there is no
evidence either way. Verified by building a throwaway copy with the fonts stubbed:
210 pages, 0 errors. The only warning is the pre-existing `@opentelemetry`
`Critical dependency: the request of a dependency is an expression`, which also
appears on the pristine tree built the same way.

**Not shipped: `package-lock.json`.** `npm install` in this sandbox rewrote it,
but the sandbox npm/Node are not your toolchain. The pre-existing
`package.json` / `package-lock.json` desync (`npm ci` fails — `@testing-library/dom`
plus 8 transitive deps missing from the lock) is still there; run `npm install`
and commit the result on your own machine.

## Left alone deliberately

- **`location.altitude` / `accuracy`** still write `0` in the Eagle Track mapper.
  Same pattern, but neither is surfaced in any UI, so neither can mislead an
  operator, and both are required by `TelematicsLocation`. Recorded here rather
  than changed silently.
- **`location.speed`** keeps its `0` default. `0` is the fail-safe value here — it
  resolves to `idle`, never `moving` — api2 sends speed on every observed
  snapshot, and the status and alerting paths all take speed as a number.
- **Demo mode** is untouched. The simulator remains the authority on a demo
  vehicle's status; demo positions are generated for "now", so there is no fix age
  to evaluate and nothing to be stale or alerting about (`stale: false`,
  `alert: null`).

## Files

**New (4)**
```
app/leaflet-overrides.css
modules/telematics/services/reading-alerts.ts
tests/unit/telematics/live-map-status.spec.ts
```

**Modified (12)**
```
app/layout.tsx
frontend/modules/telematics/components/LiveMapLeaflet.tsx
frontend/modules/telematics/components/LiveMapLegend.tsx
frontend/modules/telematics/components/LiveMapVehicleList.tsx
frontend/modules/telematics/components/VehicleDetailPanel.tsx
frontend/modules/telematics/pages/LiveMapPage.tsx
modules/ai/types/ai.types.ts
modules/telematics/adapters/eagletrack/eagletrack.adapter.ts
modules/telematics/services/live-map.service.ts
modules/telematics/services/telematics.service.ts
modules/telematics/types/live-map.types.ts
modules/telematics/types/telematics.types.ts
tests/unit/telematics/eagletrack-adapter.spec.ts
```
