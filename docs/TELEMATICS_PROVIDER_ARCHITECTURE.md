# Telematics Provider Architecture

How telemetry gets from a vendor into the fleet domain, and how to add a
provider.

```
External Telematics Provider
        ↓   (vendor HTTP, vendor auth, vendor payload)
   Provider Adapter          modules/telematics/adapters/<provider>/
        ↓   (CanonicalTelemetryPoint — no vendor types cross this line)
   Provider Registry         modules/telematics/providers/provider.registry.ts
        ↓
Canonical Telemetry Contract modules/telematics/providers/canonical-telemetry.ts
        ↓
  Shared Telemetry Ingestion telematicsService.ingestTelematicsData
        ↓   (ownership resolved from the VEHICLE record)
   Fleet Domain Model
```

**The rule:** fleet domain code must not know whether a reading came from
Cartrack, Eagle Track, or a provider that does not exist yet.

---

## Adding a provider

Two steps. If a third is needed, that is a bug in the abstraction.

**1. Write the adapter.** In `modules/telematics/adapters/<provider>/`,
implement `TelematicsProvider`:

```ts
export class AcmeProvider implements TelematicsProvider {
  readonly descriptor = {
    providerId: 'acme',
    name: 'ACME Telematics',
    capabilities: [TelematicsCapability.LIVE_POSITION],
  };

  async getStatus(tenantId) { /* configured for this tenant? */ }
  async testConnection(tenantId) { /* credentials valid? */ }
  async listDevices(tenantId) { /* the vendor's roster */ }
  async getLiveTelemetry(tenantId) { /* CanonicalTelemetryPoint[] */ }
}
```

**2. Register it** in `provider.bootstrap.ts`:

```ts
providerRegistry.register(acmeProvider);
```

That is the whole process. `tests/security/telematics-provider-extensibility.spec.ts`
asserts that a third provider (`MockTelematicsProvider`) appears in **no
file** outside its own directory, so if adding one starts requiring edits
to fleet intelligence, the vehicle domain, attention, reporting or
analytics, that suite fails.

### What you must NOT do

- **Do not infer identity from a device-id string.** `providerId` is a
  field. Only `provider.resolve.ts` may parse a prefix, and only as a
  transitional fallback for rows written before Phase 2.
- **Do not return fake data for an unsupported capability.** Do not
  implement the method, and do not list the capability. An empty array is
  indistinguishable from "the fleet reported nothing", which is a real
  and different answer.
- **Do not set `tenantId` or `orgUnitId`.** They are absent from
  `CanonicalTelemetryPoint` by design. Ownership is resolved from the
  vehicle record by the ingestion layer.
- **Do not substitute zero for a missing measurement.** See below.

---

## Provider identity and device mapping

Three distinct concepts. Collapsing them is what made
`deviceId.slice('eagletrack-'.length)` necessary — and that parse breaks
for any provider whose ids contain a hyphen.

| Concept | Meaning | Example |
|---|---|---|
| `providerId` | Which integration | `eagletrack` |
| `externalDeviceId` | The **vendor's** own device id, verbatim | `1234567890` (a uin) |
| `vehicleId` | **Our** canonical entity, a Mongo `_id` | `652f...` |
| `deviceId` | Our storage key, `<providerId>-<externalDeviceId>` | `eagletrack-1234567890` |

```
Vehicle  (canonical, ours)
   └── TelematicsDevice
           ├── providerId          ← first-class since Phase 2
           ├── externalDeviceId    ← first-class since Phase 2
           ├── deviceId            ← storage key, one producer
           ├── status
           └── metadata
```

The vehicle stays canonical; a provider is an external data source. **A
vehicle is never duplicated per provider.**

`deviceId` keeps its composite shape so existing rows, the
`{tenantId, deviceId}` unique index and every stored reading keep
working — Phase 2 adds fields, it does not perform a destructive rename.
It is now a documented storage detail with a single producer
(`composeStoredDeviceId`), not an identity scheme fleet code parses.

### Unknown providers fail closed

```ts
providerRegistry.resolve('geotab')   // → throws ProviderError
providerRegistry.resolve('unknown')  // → throws ProviderError
```

There is **no default**. Before Phase 2, `providerSourceFor` ended in
`return 'cartrack'`, so every unrecognised device — including devices
posted through the generic ingest endpoint, and any provider added later
— was silently labelled Cartrack. The default was invisible because it
was plausible. An unattributable reading now reports `unknown`.

---

## Capabilities

Ask the registry. Never name a vendor.

```ts
// Right
if (providerSupports(providerId, TelematicsCapability.FUEL_REPORT)) { ... }

// Wrong — this is the coupling Phase 2 removes
if (providerId === 'eagletrack') { ... }
```

| Capability | Cartrack | Eagle Track |
|---|:--:|:--:|
| `live_position` | ✔ | ✔ |
| `alerts` | ✔ | ✔ |
| `historical_position` | — | ✔ |
| `fuel_report` | — | ✔ |
| `driver_sync` | — | ✔ |
| `trigger_sync` | — | ✔ |

This asymmetry is real and is exactly why the fleet layer must not assume
one provider does what another does.

`ProviderStatus` (`enabled` / `not_configured` / `degraded`) is a
**separate, per-tenant** question. "This provider cannot do that" is a
product limitation; "this provider is not set up here" is an admin task.

---

## Canonical telemetry

`CanonicalTelemetryPoint` is the **contract** between an adapter and
ingestion. `TelematicsData` is the **persistence model**. The distinction
is load-bearing: an adapter cannot express ownership, because those
fields do not exist on the contract.

### Units — taken from the existing codebase, not invented

| Field | Unit |
|---|---|
| `speed` | km/h |
| `heading` | degrees, 0–360 |
| `odometer`, `tripDistance` | km |
| `fuelLevel`, `throttlePosition`, `engineLoad`, `batteryLevel` | percent 0–100 |
| `fuelUsed` | litres |
| `consumptionRate` | **L/100km** |
| `instantConsumption` | **L/h** |
| `engineHours` | hours |
| `batteryVoltage` | volts |
| `coolantTemp` | °C |
| `altitude`, `accuracy` | metres |
| `tripDuration`, `idleTime` | minutes |

`consumptionRate` and `instantConsumption` are separate because
conflating them is a bug this codebase already had: Eagle Track io-199 is
"Fuel Consumption, L/h" and was being written to the L/100km field.

An adapter whose vendor uses different units **must convert, and must
refuse rather than guess when the unit is ambiguous**. The precedent is
`eagletrack-report-values.ts`, which rejects `gal` (US vs imperial), a
bare `m` (metres vs miles — a 1000× error on an odometer), and an
ambiguous decimal comma.

### Absent is not zero

Every measurement is optional and **must be omitted** when unreported.

| Fabricated value | Consequence |
|---|---|
| `fuelLevel: 0` | Trips the `< 10` low-fuel branch → high-severity alert + manager notification **on every poll** |
| `odometer: 0` | Used to win over the vehicle's real odometer in the digital-twin chain |
| `heading: 0` | Points every non-reporting vehicle's arrow due north |
| `accuracy: 0` | Reads as a **perfect** fix — a quality filter would preferentially keep readings whose quality is unknown |
| `ignition: false` | Idle is derived from ignition-on-while-stationary, so every non-reporting vehicle is permanently not-idling |

A **genuine** zero is preserved: a stationary vehicle really is doing
0 km/h, and an empty tank really is 0%.

### Timestamps

`recordedAt` is the **provider's** clock, normalised to UTC.
`normaliseTimestamp` accepts ISO-8601, a `Date`, and an epoch in seconds
or milliseconds; a zone-less `YYYY-MM-DD HH:mm:ss` is read as **UTC**,
not server-local, because a provider's server timezone is not ours.

Anything unparseable returns `undefined` and **the reading is dropped**.
It is never stamped with server time: that would make a malformed or
replayed reading look like the freshest fix in the fleet and win every
"is this newer than what I hold" comparison. `new Date(0)` would sort as
the oldest reading in the fleet.

Provider clock (`lastFixAt`) and our wall clock (`lastPingAt`) are
separate fields on `TelematicsDevice` and **must never be compared** —
doing so caused an incident where readings were skipped as stale
essentially permanently.

---

## Error model

Adapters translate at their own boundary and throw `ProviderError`. Fleet
callers switch on `category`, never on provider identity or a vendor
status code.

| Category | HTTP | Retryable | Meaning |
|---|:--:|:--:|---|
| `authentication_failed` | 401 | no | Credentials rejected |
| `authorization_failed` | 403 | no | Authenticated, not permitted |
| `unsupported_capability` | 501 | no | This provider cannot do it |
| `device_not_found` | 404 | no | Provider has no such device |
| `vehicle_not_mapped` | 404 | no | Device maps to no vehicle here |
| `malformed_response` | 502 | no | Reached it; could not read the reply |
| `rate_limited` | 429 | **yes** | Back off, then retry |
| `provider_unavailable` | 502 | **yes** | Unreachable or 5xx |
| `transient_error` | 502 | **yes** | Timeout, DNS, socket reset |

502 rather than 500 for upstream failures, so an operator can tell "the
vendor is down" from "we have a bug".

**Raw vendor detail does not cross the boundary.** `providerDetail` is a
short, already-redacted string for logs and admin surfaces — never the
vendor's response object, so a caller cannot start depending on a
vendor's JSON shape by reaching through the error.

Eagle Track's classification is preserved rather than flattened: a
`nonJsonBody` on a 2xx is the vendor's **login page**, meaning the token
is wrong. Without that distinction a bad credential surfaced as a
platform outage.

### Logging

Log `providerId`, `externalDeviceId`, `vehicleId`, operation, result,
error category. **Never** tokens, passwords or authorization headers.
`ProviderError.toLogContext()` enumerates its fields explicitly rather
than spreading `this`, so a field added later cannot silently start
appearing in logs.

---

## Configuration

```
provider config (encrypted at rest) → registry → adapter
```

Registration is **explicit, by name, in code** (`provider.bootstrap.ts`).
There is no discovery-by-convention: no directory scan, no dynamic import
of a path built from a string. A registry that can be populated from data
can be populated from a **request** — `resolve(req.query.provider)` must
be able to fail, never to load.

`registry.register()` throws on a duplicate id rather than replacing,
because two modules both believing they own `cartrack` with the winner
decided by import order is a bug that only appears in production, and
only under a specific bundling.

The demo simulator and the mock provider are **not** registered. Neither
has credentials or an external API; a provider that fabricates positions
must never be resolvable in a real deployment.

---

## Migration

Rows written before Phase 2 carry only the composite `deviceId`, so
`provider.resolve.ts` falls back to prefix parsing — in **exactly one
place**, so it can be deleted.

```bash
npm run db:backfill-device-provider              # dry run
npm run db:backfill-device-provider -- --apply
```

Only **adds** fields; never renames `deviceId`, never deletes, never
touches readings. Only fills rows where the field is missing, so a
partial run resumes safely and a second full run is a no-op. Devices
matching no known prefix are **reported and skipped, not guessed** —
assigning them a default provider is the defect Phase 2 removes.

Once every device carries `providerId`, the fallback in
`provider.resolve.ts` can go.

---

## Where provider-specific code is still allowed

Legitimate, and deliberately unchanged:

- `modules/telematics/adapters/<provider>/**` — vendor auth, parsing,
  pagination, retry, unit validation.
- `app/api/telematics/<provider>/**` — admin/config endpoints. A vendor's
  credential form is inherently vendor-specific.
- `<provider>-config.repository.ts` — per-vendor credential storage.
- `getEagleTrackUinForVehicle` — one caller (the Eagle Track history and
  fuel endpoints, which need a uin to query the vendor). Making it
  generic would be a speculative abstraction of a vendor-specific need.
  The provider-neutral path for "give me this vehicle's readings" is
  `getTelematicsHistory`, which knows nothing about providers.

What is **not** allowed is generic fleet code — intelligence, vehicles,
attention, reporting, analytics, shared ingestion — depending on any of
it. That is asserted, not just documented.
