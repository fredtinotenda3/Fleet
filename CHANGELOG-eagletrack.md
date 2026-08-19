# CHANGELOG — Eagle Track Telematics Provider Adapter

Adds **Eagle Track** (white-labelled "api2" GPS platform) as a second
third-party telematics provider, following the architectural pattern
established by the Cartrack integration in `modules/telematics/`.

Same tenancy model, same encryption-at-rest primitive, same permission
gating, same test discipline. Different wire protocol, wired into the
same ingest pipeline.

---

## 1. Verification results

| Check | Baseline (as received) | After this change |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx jest` | 458 pass / 2 fail — 37 suites | **570 pass / 2 fail — 43 suites** |
| `npm run build` | fails: `next/font` fetch | **exit 0, clean** (see note) |

**+112 tests, +6 suites, zero new failures.**

### The 2 failing tests are pre-existing and unrelated

`tests/security/predictive-maintenance-consolidation.spec.ts` asserts that
`modules/intelligence/services/predictive-maintenance.service.ts` was
deleted during Phase 0. That file is still present in the uploaded
archive, so the suite was already red before any Eagle Track work
started. Both failures reproduce on the untouched archive. **Not fixed
here** — deleting a service file is a decision, not a mechanical
cleanup, and it is outside this task's scope.

### Build note

`npm run build` fails on the received archive *before compiling any
application code*, because `app/layout.tsx` fetches Geist/Geist Mono from
`fonts.googleapis.com` at build time and that host is unreachable in this
sandbox. A build that dies at the font step proves nothing about the new
code, so verification was done by temporarily replacing the two
`next/font/google` calls with inert stubs, building, then restoring
`app/layout.tsx` byte-for-byte (`diff` confirmed clean) and re-running
tsc + jest.

With fonts stubbed the build **succeeded (exit 0)**. All three new routes
appear in the route manifest:

```
├ ƒ /api/telematics/eagletrack/config                801 B    102 kB
├ ƒ /api/telematics/eagletrack/sync                  801 B    102 kB
├ ƒ /api/telematics/eagletrack/test-connection       801 B    102 kB
```

The only warnings were the two pre-existing "Critical dependency: the
request of a dependency is an expression" notices from
`@opentelemetry/sdk-node` and `bullmq`.

`app/layout.tsx` is **not** in the delivered file set. `.next/` and the
generated `next-env.d.ts` were removed before packaging.

### Cartrack regression results

| Suite | Result |
|---|---|
| `tests/unit/telematics/cartrack-config-form-schema.spec.ts` | **PASS**, unmodified |
| `tests/security/telematics-cartrack-config-gating.spec.ts` | **PASS**, unmodified |

No file under `modules/telematics/adapters/cartrack/`,
`cartrack-config.repository.ts`, `cartrack.controller.ts`,
`shared/validations/cartrack.schema.ts`, `app/api/telematics/cartrack/**`
or `CartrackConfigSection.tsx` was touched. Cartrack's runtime behaviour
is byte-identical, including its existing `fuel_level_percent ?? 0`
mapping — see §8, item 1.

### How to run

```bash
npm install          # NOT `npm ci` — see §7, item 5
npx tsc --noEmit
npm run test:unit    # jest tests/security tests/unit
npm run test:security
npx jest             # everything
```

---

## 2. Files created (19)

### Backend — adapter

| File | Purpose |
|---|---|
| `modules/telematics/adapters/eagletrack/eagletrack-io.map.ts` | Numeric IO code → field lookup. Plain data: named constants, a documented catalogue, and ordered preference lists. No IO code appears inline anywhere else. |
| `modules/telematics/adapters/eagletrack/eagletrack.types.ts` | Wire types: `EagleTrackEnvelope`, `EagleTrackTrackerStatus`, `EagleTrackLastResponse`, `EagleTrackTracker`, `EagleTrackTrackersResponse`, `EagleTrackConfig`, `EagleTrackSyncResult`, `EagleTrackReadingMetadata`. Header documents shape assumptions, same disclaimer style as `cartrack.types.ts` (no live sandbox). |
| `modules/telematics/adapters/eagletrack/eagletrack-api.client.ts` | Thin HTTP client. `token` header, envelope-error throwing, AbortController timeout, `getLastForAll()`, `getTrackers()`, `verifyCredentials()`. No tenant or vehicle knowledge. |
| `modules/telematics/adapters/eagletrack/eagletrack.adapter.ts` | Bridge into `telematicsService.ingestTelematicsData`. `syncOrganization` / `ingestStatus` / `registerDevice` / `testConnection`, mirroring `CartrackAdapter`. Pure mapping helpers exported for direct testing. |

### Backend — persistence, controller, validation, routes

| File | Purpose |
|---|---|
| `modules/telematics/repositories/eagletrack-config.repository.ts` | Collection `tbltelematics_eagletrack_config`. `getConfig`, `getResolvedConfig`, `upsertConfig`, `recordSyncResult`, `setEnabled`, `listEnabledTenantIds`. |
| `modules/telematics/controllers/eagletrack.controller.ts` | `getConfig`, `saveConfig`, `testConnection`, `syncNow`. |
| `shared/validations/eagletrack.schema.ts` | Zod: `enabled` boolean, `domain` required URL with http/https refinement, `token` min 1. |
| `app/api/telematics/eagletrack/config/route.ts` | GET + PUT, `Permission.ORG_SETTINGS` |
| `app/api/telematics/eagletrack/test-connection/route.ts` | POST, `Permission.ORG_SETTINGS` |
| `app/api/telematics/eagletrack/sync/route.ts` | POST, `Permission.VEHICLE_EDIT` |

### Frontend

| File | Purpose |
|---|---|
| `frontend/modules/telematics/schemas/eagletrack.schema.ts` | Form schema mirroring the backend rule-for-rule, plus `isInsecureDomain`. |
| `frontend/modules/telematics/hooks/useEagleTrackConfig.ts` | Query + save mutation + separate `testConnection` mutation. |
| `frontend/modules/telematics/components/EagleTrackConfigSection.tsx` | Settings card. Blank-token-on-load handling, derived status badge, inline plain-http warning, matching-limitation note. |

### Tests

| File | Coverage |
|---|---|
| `tests/unit/telematics/eagletrack-config-form-schema.spec.ts` | Valid payload; required fields; non-URL and non-http(s) domain; plain http accepted; `enabled` must be boolean; token never optional; **form and backend schemas agree on 8 payloads**. |
| `tests/unit/telematics/eagletrack-io-map.spec.ts` | Preference ordering; fallback; boolean rejected for numeric fields; stringified numerics; genuine zero preserved; **percent and litre code lists proven disjoint**; `signalex` decoding; metadata collection. |
| `tests/unit/telematics/eagletrack-api-client.spec.ts` | Token in header and *absent from URL*; least-privilege selector; `/api2` not doubled; `error !== 0` throws on HTTP 200; vendor rejection vs. transient classification; `verifyCredentials` returns false on rejection but **rethrows a 503**; `flattenLastPayload` uses the key as authoritative uin. |
| `tests/unit/telematics/eagletrack-adapter.spec.ts` | Date parsing (UTC, rollover rejection, boundaries); fix validation; matching discipline; the vendor's published sample payload mapped end-to-end; **`fuelLevel` omitted when unreported**; litres never written to the percent field; idle derivation; sync accounting; staleness guard; per-tracker failure isolation; envelope error recorded as failure. |
| `tests/unit/telematics/eagletrack-worker-wiring.spec.ts` | All four wiring points present; enabled-tenants-only enumeration; per-tenant try/catch; **Cartrack branch still returns before the Eagle Track branch**. |
| `tests/security/telematics-eagletrack-config-gating.spec.ts` | Route permissions; token/ciphertext never returned (including **no prefix of any length**); invalid payloads never reach the repository (5 cases); every route file wrapped in `withAuth`; encryption uses the shared service and introduces no crypto of its own. |

---

## 3. Files modified (14)

Line counts are changed lines (`diff` `<`/`>` totals), including comments.

### Required for the integration

| File | Δ | Change |
|---|---|---|
| `workers/telemetry.worker.ts` | 45 | Added `eagletrack-sync` branch, structurally identical to `cartrack-sync`; two imports. Added an explicit `return;` to the end of the Cartrack branch so the two cannot both run for one job. |
| `infrastructure/queue/queue.service.ts` | 3 | `JobType.EAGLETRACK_SYNC` + `telemetry-jobs` queue mapping. |
| `server/scheduler/bootstrap-schedules.ts` | 1 | `telemetry-eagletrack-sync` schedule, `*/2 * * * *`. |
| `frontend/modules/organizations/pages/OrganizationSettingsPage.tsx` | 13 | Renders `EagleTrackConfigSection` beneath `CartrackConfigSection` in the Integrations tab, separated by a rule. |
| `frontend/modules/telematics/types/index.ts` | 47 | `EagleTrackConfigStatus`, `EagleTrackConfigInput`, `EagleTrackSyncResult`, `EagleTrackTestConnectionResult`. |
| `frontend/modules/telematics/services/telematics.api.ts` | 27 | `getEagleTrackConfig`, `updateEagleTrackConfig`, `testEagleTrackConnection`. |
| `frontend/modules/telematics/hooks/useLiveMap.ts` | 1 | `telematicsKeys.eagletrackConfig()`. |
| `frontend/modules/telematics/hooks/index.ts` | 1 | Barrel export. |
| `frontend/modules/telematics/components/index.ts` | 1 | Barrel export. |
| `frontend/modules/telematics/schemas/index.ts` | 2 | Barrel export. |

### Judgement calls — read these

| File | Δ | Change |
|---|---|---|
| `modules/telematics/types/telematics.types.ts` | 34 | **`engine.fuelLevel: number` → `fuelLevel?: number`**, and a new optional `providerMetadata?: Record<string, unknown>`. Both purely widening. See §4.1 and §4.2. |
| `modules/telematics/services/telematics.service.ts` | 7 | `checkForAlerts` now guards the low-fuel comparison with `typeof === 'number'`. Required by the widening above; 0 still alerts, absent does not. |
| `modules/telematics/types/live-map.types.ts` | 12 | `LiveMapDataSource` gains `'eagletrack'`. Additive union member. |
| `modules/telematics/services/live-map.service.ts` | 26 | `source` derived from the device-id prefix via a new exported `providerSourceFor`, replacing the hardcoded `'cartrack'`. `'cartrack'` remains the fallback, so no existing behaviour changes. See §7.4. |

---

## 4. Key design decisions

### 4.1 `engine.fuelLevel` is now optional — and this exposed a live Cartrack defect

`telematics.service.ts` raises a **high-severity `maintenance` alert and
sends a fleet-manager notification** whenever `engine.fuelLevel < 10`.

`CartrackAdapter.ingestStatus` writes `status.fuel_level_percent ?? 0`.
So a Cartrack vehicle whose device reports no fuel level is ingested with
`fuelLevel: 0`, which is `< 10`, which fires a *"Low fuel level: 0%"*
alert **plus a notification, on every poll** — every 2 minutes, per
`telemetry-cartrack-sync`.

Eagle Track must not inherit that, and the only honest representation of
"this device does not report fuel" is an absent field: `undefined < 10`
is `false`, so no alert. Hence the widening.

Consumers checked individually — nothing breaks:

- `live-map.service.ts` already read it as `latest.engine?.fuelLevel`.
- `digital-twin.service.ts` assigns it to an already-optional field.
- `shared/validations/telematics.schema.ts` still **requires** it, so the
  public HTTP ingest contract is unchanged.
- `demo-simulator.service.ts` always supplies a number.
- `checkForAlerts` needed the `typeof` guard, now added.

Cartrack still writes `0`. **Not changed here** — this pass is
Cartrack-neutral by instruction. The service-level guard stops the alert
firing, but a Cartrack vehicle with no fuel telemetry will still *display*
0%. The one-word fix is `?? undefined` in `cartrack.adapter.ts`;
flagged in §8.

### 4.2 `providerMetadata` instead of forcing signals into unrelated fields

Battery volts, power volts, `signalex` quality, engine hours, vendor
alert ids, fuel litres, and which IO code each value came from have no
field on `TelematicsData`. §2 of the brief says not to force them
elsewhere; there was nowhere to put them.

`providerMetadata?: Record<string, unknown>` is opaque by design —
nothing in alerting, geofencing or reporting reads it, so its contents
can never change how a reading is interpreted. Each provider documents
its own shape (`EagleTrackReadingMetadata`).

An alternative would have been a module-augmentation addendum, following
`telematics.tenancy-addendum.ts`. Rejected: that pattern exists to add a
*cross-cutting* dimension (`orgUnitId`) to types owned by many modules,
whereas this is the telematics module's own type gaining its own field.
Declaration merging also cannot change an existing member's optionality,
so §4.1 needed a direct edit regardless.

### 4.3 Vehicle matching (brief §4)

Implemented exactly as specified, and no further:

1. `__platenumber` present and non-empty → `vehicleRepository.findByLicensePlate(plate, tenantId)`.
2. Otherwise **no match**. No fuzzy matching against `name`.
3. Every unmatched tracker returned in `unmatchedTrackers`. Never dropped, never auto-created.
4. Documented prominently in `eagletrack.adapter.ts`'s header.

Rationale recorded in the header: a *wrong* match is worse than no match.
A misattributed reading writes another vehicle's GPS trace, odometer and
fuel level into this vehicle's history, fires its geofence and speeding
alerts, and — once the finance module posts telemetry-driven costs —
attributes distance to the wrong cost centre. Unwindable only by hand.

Long-term fix named in the header: an explicit admin-managed uin ↔
vehicle mapping table, which removes the dependency on a free-text vendor
custom field entirely. `unmatchedTrackers` is exactly that screen's input.

### 4.4 IO-code mapping (brief §2)

All in `eagletrack-io.map.ts` as ordered preference lists. First code
present wins. **No numeric code appears inline in the adapter.**

| Target | Codes, in preference order | Note |
|---|---|---|
| `trip.odometer` | `226` CAN Odometer → `7` Odometer | CAN preferred: it is the vehicle's instrument reading. The vendor's own sample shows `io["7"] = 3.149` km — distance since install — which would be flatly wrong as a fleet odometer. |
| `engine.fuelLevel` | `228` CAN Fuel % → `200` Fuel % | **Percent only.** |
| `providerMetadata.fuelLevelLitres` | `224`, `192`–`196` | Litres, never written to the percent field. |
| `engine.rpm` | `227` CAN RPM → `208` RPM | |
| `engine.coolantTemp` | `231` CAN Engine Temperature | |
| `fuel.consumptionRate` | `199` Fuel Consumption L/h | |
| `fuel.fuelUsed` | `225` CAN Total Fuel Used → `198` Fuel Used | |
| `trip.idleTime` | `1` Ignition | See below. |
| `providerMetadata.io` | `176`, `177`, `178`, `179`, `3`, `230`, `4`, `2` | Battery/power/hours/door/blocked. |

**Ignition (`io["1"]`).** `TelematicsData` has no ignition field. Mapped
to `trip.idleTime` as `ignition_on && speed === 0 ? 1 : 0` — deliberately
identical to Cartrack's convention, so both providers feed the idle
metric the same way rather than each inventing one. `null` (not reported)
is treated as *not* idling: idle time is only claimed when the tracker
positively reports ignition on.

**Litres are never percentages.** `engine.fuelLevel` is constrained to
0–100 by the ingest schema and drives a `< 10` alert. Writing "8 litres"
there fabricates a low-fuel alert for a vehicle with 8 L in a 60 L tank,
on every poll. A test proves the two code lists are disjoint.

**`signalex`.** Parsed into `{batteryPercent, gsmQuality, gpsSatellites}`
per the documented `[gsb]` scales and stored in metadata only, never
mapped onto a `TelematicsData` field. Malformed values return `null`
rather than half-decoding.

### 4.5 Envelope errors are real errors

api2 answers **HTTP 200 with `{"error": <code>}`** on failure. Checking
`response.ok` alone would turn a rejected token into a successful empty
sync — indistinguishable from *"this tenant has no vehicles"*, and
therefore invisible. The client throws `EagleTrackApiError` on both
envelope and transport failures, and `recordSyncResult(tenantId,
'error', message)` records it. A test asserts the vendor error code
reaches `recordSyncResult`.

`EagleTrackApiError.isVendorRejection` distinguishes a coherent rejection
(envelope error code, or HTTP 401/403) from a transport problem.
`verifyCredentials` returns `false` for the former and **rethrows** the
latter: reporting "invalid credentials" when the platform is merely
unreachable sends an operator to rotate a token that was never the
problem.

### 4.6 Token in a header, never the URL

The vendor's documentation puts `&token=...` in the query string "for
convenience". A credential in a URL lands in access logs, proxy logs and
referrers. Header only. A test asserts the token string appears in the
request headers and **does not appear anywhere in the request URL**.

### 4.7 `__all_sub`, not `__all_sys_`

`__all_sys_` is "all trackers in system". On a reseller-run deployment
that pulls *other customers'* vehicles into this tenant's sync — the
exact cross-tenant leak class this codebase has spent several phases
eliminating. `__all_sub` is the least-privilege selector that still
covers a whole account in one call.

To make the trade-off safe rather than silent, `syncOrganization`
cross-references the roster against the poll and reports any tracker the
poll did not cover as `trackersWithoutFix`. If `__all_sub` under-reports
on a real deployment, that surfaces as data, not silence. A test asserts
`__all_sys_` never appears in a request URL.

### 4.8 Staleness guard — a deliberate deviation from the brief

The brief says sync is "idempotent per reading, same as Cartrack —
`ingestTelematicsData` just appends a timestamped point". That is the
Cartrack behaviour, and for Eagle Track it is not good enough.

`GET /api2/last` returns the **last known** fix. A parked or offline
vehicle returns the identical snapshot on every poll. At `*/2 * * * *`
that is ~720 duplicate rows per vehicle per day, each one re-running
geofence evaluation, re-triggering `REFRESH_ANALYTICS`, and re-marking a
dead device as `status: 'active'` via `updateDeviceLastPing`.

So `ingestStatus` skips any fix whose timestamp is not newer than the
device's stored `lastPingAt`, counts it as `skippedStale`, and does not
touch `updateDeviceLastPing`. The device read that supplies `lastPingAt`
is the same one used to decide whether to register the device — no extra
round trip. Offline detection continues to run off `lastPingAt` age via
the module's existing `getOfflineDevices`.

Still counted in `matched`, because the vehicle *is* covered by the
integration — `skippedStale` is reported separately.

### 4.9 Null-island rejection

A tracker with no satellite lock reports `lat: 0, lng: 0` rather than
omitting the fields. Ingesting that places the vehicle in the Gulf of
Guinea, corrupts distance calculations, and fires geofence-exit alerts
for every vehicle that briefly loses signal. Exact `(0, 0)` is rejected
as `skippedNoFix`. A genuine zero on **one** axis is accepted — the
equator and the prime meridian both exist.

### 4.10 Timestamps parsed as UTC

`date` arrives as `"2020-04-21 08:40:57"` with no offset or designator.
The vendor's user object carries a `timezone` field, which suggests
timestamps are rendered in the token user's timezone — an inference from
the documentation, not a confirmed contract.

Passing the raw string to `new Date()` parses it as **server-local**,
which is the one option that is definitely wrong: the same payload yields
different timestamps on a laptop and in a container. So: explicit UTC,
deterministic and locale-independent. The raw string is preserved on
every reading (`providerMetadata.rawDate`) so a confirmed convention can
be applied by migration rather than being unrecoverable.

**A bug this caught.** `Date.UTC` silently *rolls over* out-of-range
components: `"0000-00-00 00:00:00"` — a common vendor sentinel for
"never reported" — became `1899-11-30`, a permanent outlier at the head
of every history query that would also make the staleness guard treat
every later fix as newer. The parser now round-trips the components back
out of the constructed `Date` and rejects anything silently corrected.
Also rejects `2026-02-30`, `2026-13-01`, `2026-04-31`, hour 25. Found by
`eagletrack-adapter.spec.ts` during development, not by review.

### 4.11 `http://` accepted, with the risk surfaced

The vendor's documentation and sample endpoints are plain `http`, and
real deployments run without TLS. Rejecting `http` would make the
integration unusable for those tenants while doing nothing to secure
them. The token travels in a request header, so on `http` it is readable
on the network path.

So the schema accepts `http` and `https` (and rejects everything else),
and the settings card shows a **destructive-variant inline warning**
whenever the entered domain is `http`. Visible risk beats a silent one or
an unusable feature.

### 4.12 `domain`, one name end to end

The brief writes the field as "domain (baseUrl)". A single name is used
everywhere — zod schema, repository input, stored document field,
controller response, frontend type, form field — with no alias and no
mapping seam. Cartrack's `baseUrl` parallel is structural, not literal.

`normaliseEagleTrackBaseUrl` strips trailing slashes and a trailing
`/api2`, because operators paste the URL they use in a browser and
`/api2/api2/last` is a 404 that looks like a broken integration.

---

## 5. New API routes

| Method | Path | Permission |
|---|---|---|
| GET | `/api/telematics/eagletrack/config` | `ORG_SETTINGS` |
| PUT | `/api/telematics/eagletrack/config` | `ORG_SETTINGS` |
| POST | `/api/telematics/eagletrack/test-connection` | `ORG_SETTINGS` |
| POST | `/api/telematics/eagletrack/sync` | `VEHICLE_EDIT` |

All wrapped in `withAuth`. Identical wiring to Cartrack's routes. No new
permissions were added to `server/permissions/roles.ts`.

**Neither `GET` nor `PUT` config ever returns the token, its ciphertext,
or any prefix of either.** Unlike Cartrack — which legitimately returns
`accountId`/`apiKey` as non-secret identifiers — Eagle Track's static
token *is* the entire credential, so the response carries only
`configured`, `enabled`, `domain`, and sync status.

## 6. Environment, schema, and workers

**New environment variables: none.** Token encryption reuses
`SECRETS_ENCRYPTION_KEY` via `infrastructure/secrets/encryption.service.ts`
— same helper, same call sites, no new crypto.

**New collection:** `tbltelematics_eagletrack_config`.

```
tenantId, enabled, domain, tokenEncrypted,
lastSyncAt, lastSyncStatus, lastSyncError,
createdAt, updatedAt, updatedBy
```

One document per tenant (upsert on `{ tenantId }`). Org-wide, not
org-unit scoped — same reasoning as Cartrack's config: the account is a
whole-organization integration, and the telemetry it returns is matched
and scoped per vehicle at ingest.

**No migration required.** New collection, absent config reads as
"not configured", nothing backfills. **No index definitions added** —
consistent with the Cartrack config collection, which has none either;
single-document-per-tenant lookups on a table with one row per tenant.
Worth folding into the outstanding finance-index work rather than
one-off here.

**New background worker/job:** `eagletrack-sync` on the existing
`telemetry-jobs` queue, `*/2 * * * *`, via a new `JobType`. No new
worker class, no new queue. Enumerates only tenants with the integration
enabled; a single tenant's failure never aborts the sweep — which
matters more here than for Cartrack, because every tenant points at a
*different* host we do not operate.

## 7. Known limitations

1. **Match rates will be low** on any deployment that has not curated
   `__platenumber`. By design (§4.3). Every miss is reported in
   `unmatchedTrackers`; nothing is guessed. Real fix: an admin-managed
   uin ↔ vehicle mapping UI.

2. **`__platenumber` collisions within a tenant.** A junk value like
   `"abc"` will match a vehicle genuinely plated `ABC` in the same
   tenant. Within-tenant only (`findByLicensePlate` is tenant-scoped),
   but it is a wrong match. The mapping UI in item 1 removes it.

3. **Odometer scale can jump** if a tracker reports `io["226"]`
   intermittently — CAN kilometres one reading, device-accumulated
   kilometres the next. Mitigated, not solved:
   `providerMetadata.odometerSourceCode` records which code each reading
   used, so a jump is diagnosable rather than mysterious. Flipping the
   preference is a one-line array change in `eagletrack-io.map.ts`.

4. **Live-map `source` label is approximate.** Derived from the
   device-id prefix, so `'cartrack'` remains the fallback for devices
   that post to the generic ingest endpoint and have nothing to do with
   Cartrack. That was already the behaviour (the value was hardcoded),
   so this is strictly an improvement — but the correct fix is a
   first-class `provider` field on `TelematicsDevice`, set at
   registration and backfilled from the prefix. Not done here: it
   touches every existing device row.

5. **`npm ci` fails from clean, on the archive as received.**
   `package-lock.json` is out of sync with `package.json` —
   `@testing-library/react@^16.3.2` was added without relocking, so 9
   transitive packages are missing from the lockfile. This breaks CI and
   is a regression against the earlier `npm ci` fix. **Pre-existing, not
   caused by this change.** `npm install` was used locally and the
   original `package-lock.json` was restored byte-for-byte before
   packaging (`diff -q` confirmed), so this ZIP does not carry a relock —
   that should be its own commit.

6. **No component-render test** for `EagleTrackConfigSection.tsx`. Jest
   is node-environment only, with no jsdom configured; the Cartrack suite
   has the same gap for the same reason and documents it. The form schema
   is tested in isolation, and additionally proven rule-for-rule
   equivalent to the backend schema across 8 payloads.

7. **Config collections are not in `module-scope.registry.ts`.**
   Neither `tbltelematics_eagletrack_config` nor
   `tbltelematics_cartrack_config` is listed. `module-scope-conformance.spec.ts`
   passes either way because `telematics` is registered with its four
   data collections. Consistent with what is there, but see §8, item 2.

8. **Sync result is not persisted.** `unmatchedTrackers` /
   `trackersWithoutFix` are returned to the caller of `POST /sync` and
   logged by the worker, but only `lastSyncStatus`/`lastSyncError` are
   stored. The settings card therefore cannot show unmatched trackers
   from a *background* sync. Persisting the last result is the natural
   companion to the mapping UI in item 1.

## 8. Decisions needing your sign-off

1. **The Cartrack low-fuel alert storm** (§4.1). `?? 0` means every
   Cartrack vehicle without fuel telemetry currently generates a
   high-severity alert *and* a fleet-manager notification every 2
   minutes. The service-level `typeof` guard added here stops the alert
   firing, but Cartrack still *writes* `0`, so those vehicles still
   display 0% fuel. One-word fix (`?? undefined`), deliberately left
   alone to keep this pass Cartrack-neutral.

2. **Whether integration-config collections belong in the scope
   registry** (§7.7). Registering them as explicitly organization-level
   would make the decision reviewable data rather than an omission —
   which is that registry's stated purpose. Applies to Cartrack equally.

3. **The pre-existing red suite** — `predictive-maintenance-consolidation.spec.ts`
   expects a file that is still on disk. Either the archive predates the
   Phase 0 deletion or the deletion was reverted. Worth resolving before
   it becomes accepted noise.

## 9. Eagle Track capabilities currently unsupported

Endpoints and features documented by the vendor and deliberately not
implemented in this pass. Each is an extension point, not an oversight —
the client/adapter seam means adding them changes no downstream code.

| Capability | Why out of scope |
|---|---|
| `GET /api2/history` | Historical backfill. Explicitly out of scope per §2. `flattenLastPayload` already tolerates the array-shaped payload this returns. |
| `GET /api2/reports/{pos,state,fuel,last_position,distance}` | Vendor-side reporting. Out of scope per §2. Overlaps our own report builder — needs a product decision on which is authoritative before either is wired. |
| `GET /api2/summary` | Not required by `last`/`trackers`. |
| **Vendor-side triggers and alerts** (`alert.cmd`, `alert.trigger`, `/api2/triggers`: geofence, speed, area, idle, stop, route, custom) | Recorded verbatim in `providerMetadata.vendorAlert`, **not** reconciled with our `TelematicsAlert`/geofence engine. Merging two independent alerting systems — deduplication, severity mapping, acknowledgement ownership, and what happens when the two disagree — is a larger piece of work in its own right. Everything funnels through `ingestTelematicsData` so *our* alerting runs uniformly regardless of source, exactly as Cartrack's adapter does. |
| Per-tracker and per-group polling (`uin=<id>`, `uin=__group<id>`) | Only the fleet-wide selector is used. Per-tracker polling is the natural basis for a UI "refresh this vehicle" action (Cartrack's `getVehicleStatus` equivalent), which does not exist yet. |
| Write operations (`?action=edit` / `?action=delete` on `users`, `trackers`, `groups`, `drivers`, `triggers`, …) | Read-only integration. Writing back to the vendor platform is not in scope and would need an explicit decision about which system owns each field. |
| `sensors`, `videos`, `maintenances`, `models`, `positions` (POI), `drivers` | No mapping target. `drivers` (`io["8"]`) and `maintenances` overlap our own modules and would need a reconciliation decision, not just a mapper. |
| Odometer/engine-hours as maintenance triggers | `trip.odometer` is ingested but nothing consumes it for service scheduling yet. |

## 10. Capabilities requiring additional provider confirmation

Assumptions made from documentation alone, with no sandbox or live
credentials. Each is isolated so confirmation changes one place.

1. **Timestamp timezone** (§4.10). Whether `date` is UTC or the token
   user's configured timezone. Currently parsed as UTC;
   `providerMetadata.rawDate` preserves the original so a migration can
   correct history. **Highest-impact item on this list** — a silent
   multi-hour offset corrupts trip timing, idle detection and any
   time-of-day report.

2. **`__all_sub` coverage.** Whether it returns trackers owned directly
   by the token's user as well as its sub-users. `trackersWithoutFix`
   surfaces any gap.

3. **Vendor error codes.** Which `error` values mean bad token /
   insufficient permission versus a transient fault. Currently *any*
   non-zero code is treated as a credentials verdict by
   `verifyCredentials`, so a transient vendor-side error reported in the
   envelope (rather than as a 5xx) would show as "connection failed".

4. **Pagination on object endpoints.** `pageSize`/`pageIndex` are
   documented for `history`/`reports` only. `verifyCredentials` sends
   `pageSize=1` on `trackers`; a deployment that ignores it returns the
   full roster. One request either way, but not as cheap as intended.

5. **Odometer semantics per device model** (§7.3). Which of `io["7"]` /
   `io["226"]` a given firmware reports, and whether `io["7"]` is a
   true odometer or distance-since-install. The vendor sample suggests
   the latter.

6. **Whether `__platenumber` is ever authoritative** on a real
   deployment, or whether the mapping UI (§7.1) should be built first.

7. **`signalex` scaling.** The `0–F → 0–31` GSM mapping is a linear
   interpolation of the documented range; the vendor does not state the
   exact formula. Metadata only, so nothing depends on it.

8. **Whether `offline: true` can accompany a fresh timestamp**, and what
   that means. Currently recorded in metadata; offline detection runs
   off `lastPingAt` age via the module's existing mechanism.
