# Phase 2 — Telematics Provider Contract & Registry

Implemented on top of Phase 0 (security) and Phase 1 (telemetry data
integrity).

## Status

| Acceptance criterion | Result |
|---|---|
| Cartrack implements the canonical provider interface | **YES** |
| Eagle Track implements the canonical provider interface | **YES** |
| A mock/test provider implements the same interface | **YES** |
| Providers are explicitly registered | **YES** |
| Unknown providers fail closed | **YES** |
| No unknown provider defaults to Cartrack | **YES** |
| Provider identity is explicit | **YES** |
| `providerId` / `externalDeviceId` / `vehicleId` are distinct | **YES** |
| Generic fleet services depend on no provider payload | **YES** (asserted) |
| All providers converge on one ingestion pipeline | **YES** |
| Phase 0 + Phase 1 protections intact | **YES** — 165/165 |
| Mock provider addable without touching generic fleet code | **VERIFIED** |
| Cron/worker polling driven through the registry | **DONE — verified** |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1028 passed / 1028, 63 suites** |
| Baseline 932 / 59 | **+96 tests, 0 regressions** |
| Phase 0 + Phase 1 regression | **165 passed / 165, 9 suites** |
| Provider suites | 18 + 20 + 23 + 34 = **95 passed** |

---

## What changed

### 1. Canonical provider contract

`modules/telematics/providers/`

- **`provider.types.ts`** — `TelematicsProviderId`, `TelematicsCapability`
  (6 members, each mapping to something the platform genuinely calls),
  `ProviderStatus`, `ProviderDescriptor`.
- **`provider.contract.ts`** — the `TelematicsProvider` interface:
  `getStatus`, `testConnection`, `listDevices`, `getLiveTelemetry`, plus
  optional `getHistoricalTelemetry` / `getEvents`.
- **`canonical-telemetry.ts`** — `CanonicalTelemetryPoint` and the shared
  normalisation helpers.
- **`provider.errors.ts`** — the 9-category provider-neutral error model.
- **`provider.registry.ts`** — fail-closed resolution.
- **`provider.bootstrap.ts`** — explicit registration, by name, in code.
- **`provider.resolve.ts`** — the fleet layer's entry point, and the
  *only* module permitted to parse a legacy device-id prefix.
- **`mock/mock.provider.ts`** — the third provider.

**Capabilities are not symmetric, and that is the point:** Cartrack has 2
(live position, alerts), Eagle Track has 6. A caller asks
`providerSupports(id, capability)` instead of name-checking a vendor.

### 2. Provider identity is now first-class

`TelematicsDevice` gains `providerId` and `externalDeviceId`, set at
registration by both adapters.

Three concepts that were collapsed into one string are now separate:

| | Before | After |
|---|---|---|
| provider | prefix of `deviceId` | `providerId` field |
| vendor device id | `deviceId.slice(prefix.length)` | `externalDeviceId` field |
| our entity | `vehicleId` | unchanged |

`deviceId` keeps its `<providerId>-<externalDeviceId>` shape, so existing
rows, the `{tenantId, deviceId}` unique index and every stored reading
keep working. Phase 2 **adds** fields; it does not rename anything.

### 3. The leaks that are now closed

| Site | Before | After |
|---|---|---|
| `live-map.service.ts::providerSourceFor` | `startsWith('eagletrack-')` … `return 'cartrack'` | delegates to `resolveProviderSource`; unknown → `'unknown'` |
| `live-map.types.ts::LiveMapDataSource` | closed union of 2 vendor names | `TelematicsProviderId \| 'demo' \| 'unknown' \| 'unavailable'` |
| `telematics.repository.ts::getEagleTrackUinForVehicle` | `{ deviceId: { $regex: '^eagletrack-' } }` + `.slice()` | matches `providerId`, reads `externalDeviceId` |
| `VehicleDetailPanel.tsx` | exhaustive `Record<LiveMapDataSource, string>` | partial lookup + fallback to the raw id |

The `return 'cartrack'` default was the material one. Its own comment
called it *"APPROXIMATE BY CONSTRUCTION"* and named a first-class
provider field as the correct fix. Every device that was not identifiably
Eagle Track — including devices posted through the generic ingest
endpoint, and any provider added later — was silently labelled Cartrack.
It was invisible because it was plausible.

### 4. Error model

Adapters translate at their own boundary and throw `ProviderError`.
Eagle Track's hard-won classification is **preserved rather than
flattened**: a `nonJsonBody` on a 2xx is the vendor's login page, so the
token is wrong — without that distinction, a bad credential surfaced as a
platform outage. Cartrack's message-shape mapping defaults conservatively
to `transient_error` (retryable), because defaulting to
`authentication_failed` would have an operator rotating working
credentials to fix a network blip.

### 5. Cron / worker migration — COMPLETE

Every polling path now resolves its provider through the registry. No
scheduler, cron route or service imports an adapter singleton.

**The contract gained the two operations a poller actually needs:**

- `listEnabledTenants(): Promise<string[]>` — so a sweep does not import
  a vendor config repository by name.
- `syncTenant(tenantId): Promise<ProviderSyncResult>` — the polling
  entry point. Implementations must route writes through
  `telematicsService.ingestTelematicsData`, so alerting, geofencing,
  org-unit inheritance and the WebSocket broadcast happen exactly once,
  in one place, for every provider.

Both are **non-optional** on the interface, so the compiler enforced
them on all three providers.

`ProviderSyncResult` is the neutral projection. The two adapters return
different shapes — Cartrack counts `unmatchedRegistrations`, Eagle Track
counts `unmatchedTrackers` plus `trackersWithoutFix` and `matchedBy`.
Both are meaningful to their vendor and neither is meaningful to a
scheduler. Vendor detail is not destroyed; it stays on the adapter's own
result, which the vendor-specific admin endpoints still return verbatim.

| Caller | Before | After |
|---|---|---|
| `workers/telemetry.worker.ts` | two branches, each importing a vendor config repo **and** a vendor adapter | **one generic sweep**, provider id derived from the `<providerId>-sync` job name and resolved via the registry |
| `app/api/cron/eagletrack-sync/route.ts` | `eagletrackAdapter.syncOrganization()` | `getTelematicsProvider(...).syncTenant()` |
| `eagletrack-read-through.service.ts` | `eagletrackAdapter.syncOrganization()` | registry |
| `cartrack.controller.ts` | `cartrackAdapter.testConnection/syncOrganization` | registry |
| `eagletrack.controller.ts` | `eagletrackAdapter.testConnection/syncOrganization` | registry |

**The worker now names no vendor in executable code at all** — only in
comments explaining what was removed. It fails closed on an unregistered
provider id (throws) rather than silently skipping: a schedule that
quietly stops ingesting is indistinguishable from a fleet that stopped
moving.

**No schedule migration is required.** `JobType.CARTRACK_SYNC` and
`JobType.EAGLETRACK_SYNC` are already the literal strings
`cartrack-sync` and `eagletrack-sync`, which is what the generic
dispatch matches. Stored schedules are untouched.

**One existing test was updated, deliberately.**
`tests/unit/telematics/eagletrack-worker-wiring.spec.ts` asserted that
the worker contained `jobName === 'eagletrack-sync'`,
`eagletrackConfigRepository.listEnabledTenantIds()` and
`eagletrackAdapter.syncOrganization(tenantId)` — i.e. it required the
worker to name a vendor three times, which is precisely the coupling
Phase 2 removes. Leaving it would have made the suite enforce the
defect. The *property* it protected is real and is still asserted: a
background job is wired in four places (JobType enum, queue map, cron
schedule, worker dispatch) and missing any one means the integration
appears configured and silently never polls. Two assertions were added —
that the job name still matches the dispatch pattern, and that the
dispatch fails closed.

### 6. Migration script

```bash
npm run db:backfill-device-provider              # dry run
npm run db:backfill-device-provider -- --apply
```

Idempotent, additive, dry-run by default. Devices matching no known
prefix are **reported and skipped, not guessed**. New device index
`idx_device_tenant_vehicle_provider_created` serves the `providerId`
lookup that replaced the `$regex`.

---

## The third-provider proof

`tests/security/telematics-provider-extensibility.spec.ts` (20 tests),
two independent halves:

**Behavioural** — `MockTelematicsProvider` is a full implementation with
no vendor API, no config collection and no credentials. It registers
through the same registry, is driven **typed as the interface** (so
needing anything provider-specific would not compile), and produces the
same canonical shape.

**Structural** — the assertion that matters in six months:

- The mock provider's id appears in **no file** outside its own
  directory (walks `modules`, `server`, `infrastructure`, `shared`,
  `app`, `frontend`, `workers`).
- Eight named generic fleet files mention no provider by name.
- The shared ingestion service contains no
  `=== 'cartrack'` / `startsWith('eagletrack-')`.
- Device-id prefix parsing exists in **exactly one module** — before
  Phase 2 there were two independent copies, which is how they were free
  to disagree.

A behavioural test alone would not catch someone reintroducing
`if (providerId === 'cartrack')` later.

---

## Files

**New (12)**
```
modules/telematics/providers/provider.types.ts
modules/telematics/providers/provider.contract.ts
modules/telematics/providers/canonical-telemetry.ts
modules/telematics/providers/provider.errors.ts
modules/telematics/providers/provider.registry.ts
modules/telematics/providers/provider.bootstrap.ts
modules/telematics/providers/provider.resolve.ts
modules/telematics/providers/mock/mock.provider.ts
modules/telematics/adapters/cartrack/cartrack.provider.ts
modules/telematics/adapters/eagletrack/eagletrack.provider.ts
scripts/backfill-device-provider.ts
docs/TELEMATICS_PROVIDER_ARCHITECTURE.md

tests/unit/telematics/provider-registry.spec.ts            18 tests
tests/unit/telematics/canonical-normalization.spec.ts      20 tests
tests/unit/telematics/provider-canonical-mapping.spec.ts   23 tests
tests/security/telematics-provider-extensibility.spec.ts   20 tests
```

**Modified (9)**
```
modules/telematics/types/telematics.types.ts        + providerId, externalDeviceId
modules/telematics/types/live-map.types.ts          union widened
modules/telematics/services/live-map.service.ts     providerSourceFor delegates
modules/telematics/repositories/telematics.repository.ts  providerId lookup, no regex
modules/telematics/adapters/cartrack/cartrack.adapter.ts     stamps identity
modules/telematics/adapters/eagletrack/eagletrack.adapter.ts stamps identity
frontend/modules/telematics/components/VehicleDetailPanel.tsx  label fallback
infrastructure/database/indexes.telematics-addendum.ts       + device provider index
package.json                                        + db:backfill-device-provider
```

---

## Manual steps

1. `npm ci`
2. `npm run db:backfill-device-provider` — dry run, review the
   unclassifiable list
3. `npm run db:backfill-device-provider -- --apply`
4. `npm run db:indexes` — creates `idx_device_tenant_vehicle_provider_created`
5. Deploy

Safe against a live database: the backfill only adds fields, and index
creation is `background: true`. **No Phase 1 step is superseded** — if
`npm run db:dedupe-telemetry` has not been run yet, it still must be.

---

## Backward compatibility

No breaking API changes.

- Existing Cartrack and Eagle Track sync paths are **unchanged**;
  `syncOrganization()` remains the polling entry point for cron and
  workers. The new contract face is additive.
- `deviceId` keeps its shape; no reading, index or route changes.
- `providerSourceFor(deviceId)` keeps its signature.

**One behavioural change worth knowing:** a device that previously
reported `source: 'cartrack'` by default now reports `'unknown'` if it
carries no `providerId` and no recognised prefix. That is the fix, not a
regression — but a UI filtering on `source === 'cartrack'` will see fewer
rows until the backfill runs. The frontend renders unrecognised sources
as "Unknown source" rather than blank.

---

## Remaining — outside Phase 2

Deliberately not done:

- **Phase 3** — outbox / event durability. `EventBusFactory` still
  returns `InMemoryEventBus` unconditionally.
- **Phase 4** — telemetry retention; read-through refresh still performs
  writes on the read path; geofence evaluation still runs per ping.
- **Phase 5** — workflow/rule org-unit scoping.
- **S-1** — `middleware.ts` excludes non-versioned `/api/*`, so every
  route is self-defending with no structural enforcement. Still the
  highest-leverage remaining item.

Found during Phase 2, recorded not fixed:

- **Historical ingestion from the vendor remains vendor-coupled.**
  `eagletrack-history.service.ts` and `eagletrack-fuel.service.ts` call
  `eagletrackAdapter.buildClientFor()` to reach the vendor's own history
  and fuel-report APIs, and both take a `TenantContext` because they
  perform scoped reads with `assertVehicleInScope`. The contract
  deliberately takes `tenantId` rather than `TenantContext` — background
  pollers have no request context, and forcing them to fabricate one is
  how org-unit scope gets lost. Reconciling those two shapes is a real
  design question, not a rename, so it is recorded rather than rushed.
  `getHistoricalTelemetry` on the contract already serves the
  provider-neutral read (from our own store, where the history service
  has already ingested idempotently).
- **`getEagleTrackUinForVehicle` remains vendor-named.** One caller, a
  genuinely vendor-specific need (the vendor's own API needs a uin).
  Generalising it would be a speculative abstraction.
- **`live-map.service.ts` still imports the Eagle Track read-through
  refresh** for `getLiveMapData`/`getVehicleDetail`. Making refresh
  provider-agnostic means adding a refresh capability to the contract and
  changing the live map's hot path — Phase 4 territory, alongside the
  read-path-performs-writes finding it is entangled with.
