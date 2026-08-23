# Eagle Track capabilities + live-map detail

**Verified against the uploaded `Fleet-main.zip`.**

| Check | Baseline (uploaded tree) | After |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx jest` | 669 passed / **10 failed**, 45 suites | **719 passed / 0 failed, 48 suites** |
| `npm run test:security` | 10 failed | **512 passed / 0 failed, 39 suites** |
| `npm run build` | n/a (font fetch) | **clean, 214 static pages** (was 210) |

The 10 baseline failures were **pre-existing and not mine** — see §11.

`npm run build` still fails on *your* machine at `next/font` fetching Geist from Google before compiling any app code, so a red build there is no evidence. Proven by building a throwaway copy with fonts stubbed, as in previous rounds. Only warning is the pre-existing `@opentelemetry` *Critical dependency*.

---

## 1. Historical route playback

`GET /api/telematics/eagletrack/history/:vehicleId?from=&to=&includeAlerts=`

Pages `/api2/history` at `pageSize=100`, capped at 100 pages / 7-day window, and writes each page as it arrives rather than accumulating 10,000 readings in memory and losing all of them if page 91 times out.

**Ingestion deliberately bypasses `telematicsService.ingestTelematicsData`.** Every live adapter writes through that service so its readings get the same alerting as the generic ingest endpoint — which is exactly wrong for a backfill. Replaying a month of points through the live path would re-evaluate every geofence and emit entry/exit alerts for boundaries crossed weeks ago, re-raise speeding and low-fuel alerts and push a fleet-manager notification per high/critical one, emit a `vehicle:location` websocket frame moving the live map to a stale position, and enqueue a `REFRESH_ANALYTICS` job per point. A backfill is an assertion about the past; it writes rows. Historical alerting is covered honestly by §5 instead — the provider's own events, not ours re-derived and re-notified.

Idempotent via `bulkWrite` upsert on `{tenantId, vehicleId, deviceId, timestamp}` with `$setOnInsert`, keyed on the **provider's** timestamp, plus in-batch de-dupe (a repeated timestamp inside one page would otherwise inflate the inserted count). Raw provider payload preserved in `providerMetadata`, as the live path already does.

A vendor outage is **not fatal** — stored points are returned with `providerError` set.

## 2. Fuel report

`GET /api/telematics/eagletrack/fuel/:vehicleId?from=&to=` — gated on `FUEL_VIEW`, not `VEHICLE_VIEW`.

Mapped onto `TelematicsData.fuel`. **Nothing is derived.** `fuelConsumedLitres` is never computed as initial-minus-final: those readings can come from different sensors on different scales (the io catalogue has a float sender, a CAN value, and five tank sensors), and subtracting across them would be our arithmetic presented as the provider's measurement. A field the provider didn't send is **absent, never 0** — "0 L consumed" reads as a vehicle that didn't move.

`consumptionRate` is derived from **totals**, not a mean of per-row rates: 5 km at 30 L/100km and 500 km at 9 L/100km do not average to 19.5.

## 3. Driver sync

`/api2/drivers`, on a 15-minute cadence below the position poll (a roster changes on a human timescale; pulling it every ~50s would triple vendor request volume to re-read identical data).

Resolution order: **stored provider id** → `driver_code` → exact name. Steps 2–3 reuse `driverRepository.findByNameOrCode`, which already implements "exactly one hit or nothing" — a second matcher would be a second place for the two-drivers-share-a-name rule to be got wrong. **Ambiguity is reported, never guessed** (`result.ambiguous`). A row with no provider id is skipped, not imported — importing it would create a fresh duplicate on *every* sync.

Never deletes a driver missing from the response, never overwrites a non-empty local field with an empty provider one, never touches `name` or an existing `status`.

## 4. Geofence / trigger sync

`/api2/triggers`. **Only three of seven types describe a place.** Types 1/3/4/6 are thresholds; manufacturing a boundary for a Speed Alert would put a phantom shape into `checkGeofence`, which runs on every location ping for every vehicle — a fabricated geofence isn't an inert bad row, it's a source of alerts for a place that doesn't exist.

All seven are stored raw in `tbltelematics_eagletrack_triggers` (the alert feed cites them by id). Geofences are created for 0/2/5 **only when the payload yields readable geometry** — otherwise `geofenceSkippedReason: 'no-geometry'`, never a default centre and radius. Deduped on `(tenantId, provider, providerTriggerId)`; matching on `name` would duplicate the boundary the moment somebody renamed it in the vendor UI. Nothing is deleted for being absent from a response. `alerts`/`active` are `$setOnInsert` only — local operational choices a re-sync must not silently revert.

## 5. Vendor alert mapping

`/api2/history?alertfilter=__allalert`, imported alongside the same history window.

Canonical mapping `0→geofence, 1→speeding, 2→geofence, 3→idle, 5→geofence`. **`4 Stop` and `6 Custom` get a new `'vendor'` member** on the `TelematicsAlert` union rather than being forced into a wrong bucket. Stop is not idle: idle means *engine running while stationary* everywhere else in this codebase, so filing stops as idle would inflate the idle metric with parked vehicles and misattribute idle fuel burn once finance posts telemetry-driven costs. Verified safe: nothing switches exhaustively on that union; its only reader interpolates it into a notification title.

Idempotent on `providerAlertKey` — the vendor's alert id, else a `uin+time+trigger` tuple. Every component comes from the provider payload, never our clock, so scrubbing the history slider backwards re-imports nothing. Rows with **no parseable timestamp are dropped, never stamped `new Date()`** — that would surface a months-old event as live and notify managers about it.

## 6. Admin uin↔vehicle mapping UI

`/telematics/trackers`, plus `GET/POST /api/telematics/eagletrack/tracker-links` and `DELETE .../[uin]`.

`orgUnitId` is **derived from a scope-checked vehicle lookup, never accepted from the request body** — a test asserts the field name appears nowhere in the schema file, mirroring the finance guard. This is the security-critical part: a caller who could stamp their own scope could redirect another branch's movement history, odometer and fuel into their own vehicle. That's a *write* that corrupts another branch's data, unwindable only by hand — same shape as the Phase G procurement bug, but on telemetry.

Stores the vehicle **`_id`, not the plate** (plates are mutable). Re-pointing an existing link is refused with a `ConflictError` rather than silently applied. The conflict check deliberately runs **without** the org-unit predicate — otherwise two branches could hold conflicting links for one tracker and the sync's answer would depend on document order.

The adapter consults links at **step 0**, before any heuristic. Links are still verified against the vehicle table on read: a link to a deleted vehicle falls through rather than ingesting against a dangling id.

## 7. Reverse geocoding

Nominatim, no key, no billing — same basis as the OSM tiles. Shown in the detail panel as e.g. `Suffolk Road, Harare`.

Three-state by design: a string, `null` (asked, couldn't determine → **"Address unavailable"**), or absent (no position to look up). Never a nearby-but-wrong road.

Policy compliance is load-bearing, not politeness — ignoring it gets the deployment's IP blocked, and the symptom is just "addresses stopped working": a process-wide serialising 1-req/s gate, a coarse 4dp grid cache (a parked vehicle costs one request for its whole stay, not one per 10s poll), and an identifying User-Agent (`NOMINATIM_USER_AGENT`).

A confirmed "nothing here" **is** cached; a failure to *reach* Nominatim is **not** — caching that would turn a 30-second outage into a permanently blank field.

Cache is **tenant-scoped, not shared.** A global cache would be a list of every coordinate any tenant looked at, with timestamps — a cross-tenant movement-inference channel built out of a performance optimisation. Only the **selected** vehicle is geocoded, never the fleet, and only the coordinate is sent. `TELEMATICS_REVERSE_GEOCODE=off` disables it.

## 8. Larger direction arrow

Marker 30px → **44px**; wedge reach 13px → **17px** against a 7px disc, so the arrow — not the dot — is the dominant shape. Added a concave notch so it reads as a chevron pointing somewhere rather than a generic triangle, plus a contrast ring so a green arrow over parkland doesn't disappear.

Geometry lives in five named constants; resizing is a one-number change. Colours still come from `currentColor` + inline `style` declarations, **not** SVG presentation attributes — that's what caused the flat-grey-dots bug. Status colours and alert-red unchanged; `iconSize` grew with the marker so Leaflet's hit box matches what's drawn.

---

## 9. Two fixes outside the brief, flagged not smuggled

**(a) `orgUnitId` now carried on every reading** — you approved this. The mapped payload had none and `scopeOf()` applies a bare `{orgUnitId: {$in: [...]}}` with no unassigned branch, so **every scoped user saw zero Eagle Track vehicles**. Fail-closed, never a leak, but it made the feature invisible to the roles it was built for. Can only narrow or preserve visibility. Also stamped on registered devices, so a branch manager can now see their own tracker go dark.

**(b) Unit bug.** io 199 is *"Fuel Consumption, L/h"* in the vendor's own catalogue and was written to `fuel.consumptionRate`, which the panel renders as `L/100km`. An idling truck at 2 L/h read as an impossibly efficient 2 L/100km. Moved to `instantConsumption`, which the panel already labels `L/h`. Verified the only consumers.

## 10. Architecture

New collections registered in `module-scope.registry.ts` (the conformance suite fails CI otherwise): `tbltelematics_eagletrack_links`, `tbltelematics_eagletrack_triggers` (org-unit, from vehicle), `tblgeocode_cache` (tenant-scoped reference data).

One shared `assertVehicleInScope` rather than four copies — the `tenant-context.utils.ts` lesson. **Fails closed on an unassigned vehicle**: a vehicle is owned by exactly one branch, so a missing unit is missing information, not permission. Returns 404 not 403 (a 403 confirms the vehicle exists). Sub-syncs are failure-isolated in both directions — positions are the product. Token never logged; the `dateRange` retry logs only the encoding and vendor error code.

## 11. Pre-existing failures — fixed

All 10 were `telematics-live-map-scope.spec.ts`. The read-through refresh added `eagletrackConfigRepository.getConfig()` to `getLiveMapData`/`getVehicleDetail`, but the spec never mocked it — so every test hit `connectToDatabase()` and died on `MONGODB_URI is not defined`. Ten failures, none about scoping, all masking the scoping assertions the file exists to make. Added mocks for that repo and the geocoder. `predictive-maintenance-consolidation.spec.ts` is now **green** — you applied the deletion; that item is closed.

Also updated (my changes required it): `eagletrack-adapter.spec.ts` (link-map + sub-sync mocks; `matchedBy` gained a `link` bucket) and `telematics-eagletrack-config-gating.spec.ts` (the controller now resolves a full `TenantContext`, which reaches NextAuth → `jose`, ESM, unparseable by the CommonJS transform — mocked rather than loosening the transform).

## 12. Open items / what needs your input

1. **`dateRange` encoding is unconfirmed.** Never called live. Three candidate separators are tried, retrying **only** on an explicit vendor error envelope (never on an empty result — that's legitimate for a parked vehicle), and the winner is cached per client. Every response echoes `providerQuery` so a mismatch is diagnosable in one look.
2. **Field names for fuel/drivers/triggers/alerts are unconfirmed.** Read through ordered candidate aliases in `eagletrack-payload.parsers.ts`; every response carries `unmappedFields`. **One `curl` each against `/api2/reports/fuel`, `/api2/drivers`, `/api2/triggers` turns each into a one-line alias edit** — no code changes anywhere. Until then, an absent value may mean "not reported" *or* "wrong key name", and `unmappedFields` is what tells them apart.
3. **Partial unique index recommended** on `tbltelematics_eagletrack_links {tenantId, uin}` and `tbltelematics {tenantId, vehicleId, deviceId, timestamp}`. The upsert prevents duplicates on the write path we control; without an index, two concurrent runs can both miss and both insert. Shipping an unreviewed migration into a soft-deleting collection isn't something I'd do unasked.
4. **`npm ci` still fails** on the pre-existing `package.json`/`package-lock.json` desync. `npm install` works. **I have not shipped a regenerated lockfile** — the sandbox toolchain isn't yours. Run `npm install` and commit it.
5. **Token `REDACTED_ROTATE_THIS_TOKEN` still needs rotating** — it's in the transcript and the vendor's nginx access log.
