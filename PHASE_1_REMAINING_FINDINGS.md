# Findings outside Phase 1

Recorded during Phase 1 remediation and **deliberately not implemented**, per
the change-discipline rule that a finding outside the agreed scope is written
down rather than silently fixed.

---

## Found during Phase 1

### P1-N1 · Duplicate index declarations in `tblfuellogs` and `tbltrips`
**Severity: LOW · Not fixed**

`INDEXES.tblfuellogs` lists `idx_fuel_tenant_plate_date` twice;
`INDEXES.tbltrips` lists `idx_trip_tenant_plate_date` twice. Both pairs are
**byte-identical in name and key**, so the repeated `createIndex` is a no-op and
nothing is silently clobbered.

Not a correctness defect, so not fixed here — but worth removing during any
future index tidy-up, because the *dangerous* version of this (one name bound to
two different key specs) is indistinguishable at a glance. Mongo rejects that
case with `IndexKeySpecsConflict` (86), which `ensureIndexes` deliberately
swallows, so one of the two indexes would silently never exist.

`tests/security/telematics-indexes.spec.ts` asserts the invariant that actually
matters — no index *name* is reused for a *different* key — rather than raw name
uniqueness, so it catches the dangerous case without failing on this harmless
one.

### P1-N2 · `tbltelematics_geofence_states` unique index has no tenant prefix
**Severity: LOW · Not fixed**

`idx_geofence_state_vehicle_geofence` is unique on `{vehicleId, geofenceId}`
with no `tenantId`. It is safe today only because both fields are
globally-unique ObjectIds — i.e. safe by accident rather than by design. Every
other index in the telematics set is tenant-prefixed.

Not changed here because altering a unique index on a live collection requires
a drop-and-recreate, which is a migration with a write-availability window, and
Phase 1's index work is already gated behind one manual duplicate sweep. It is
explicitly exempted (with this reasoning) in the index conformance test rather
than silently skipped.

### P1-N3 · `location.speed` still defaults to 0 in the Eagle Track adapter
**Severity: LOW · Not fixed — deliberate**

Unlike the fields fixed under F-2, this default is documented as a *fail-safe*:
`speed` feeds the live-map status derivation, where an absent value resolving to
`0` yields `idle` rather than `moving`. Substituting `undefined` would need the
status derivation changed in the same pass to avoid a vehicle with no speed
reading rendering as moving.

Recorded rather than changed because it is a behavioural change to the live map,
not a data-integrity fix, and it is genuinely safer in its current form.

### P1-N4 · Cartrack has no staleness guard
**Severity: MEDIUM · Not fixed**

`TelematicsDevice.lastFixAt` exists and its doc comment notes that Cartrack's
poll "has no staleness guard to begin with and always ingests". The Eagle Track
adapter compares provider-clock to provider-clock before ingesting; Cartrack
re-ingests whatever the poll returns, so a device that has not moved produces a
new stored reading on every cycle.

With the unique index from F-3 in place, an identical re-poll at an identical
timestamp is now rejected at the database rather than duplicated — which is a
real improvement — but the adapter still does the work and still writes when the
provider's timestamp advances without a new fix.

Not fixed because adding a staleness guard changes ingestion behaviour for a
live provider, and the correct place for it is the provider-contract work in
Phase 2 where both adapters can be held to the same rule.

---

## Audit findings Phase 1 does not address

Unchanged. Listed so the Phase 1 deliverable is not mistaken for a clean bill of
health.

| ID | Finding | Severity |
|---|---|---|
| C-4 / F-none | No provider abstraction: no shared interface, no registry, `providerSourceFor()` defaults unknown devices to `'cartrack'` | **CRITICAL (arch)** — Phase 2 |
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-10 | Multi-currency exists as type declarations only | HIGH |
| F-11 | Transactional outbox is complete and dead; `InMemoryEventBus` unconditionally | HIGH |
| F-12 | **No telemetry retention policy** — unbounded growth | HIGH — Phase 4 |
| F-13 | Geofence evaluation runs per ping with 2+ queries per fix | HIGH |
| F-14 | Two action engines, both organization-scoped, neither idempotent | MEDIUM |
| F-16 | Read-through refresh performs writes on the read path, fails open across instances | MEDIUM |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| F-20 | Nightly backup buffers the whole database into one in-memory string | MEDIUM |
| F-21 | `vercel.json` schedules the Eagle Track cron **daily**; with no map open, no telemetry is ingested | MEDIUM |
| F-25 | No error-monitoring backend | LOW |
| S-1 | `middleware.ts` excludes non-versioned `/api/*`; every route is self-defending with no structural enforcement | **ARCHITECTURAL** |
| N-3 (Phase 0) | `createAlert` writes no `orgUnitId` while `getActiveAlertsInScope` filters on it — alert store invisible to scoped roles | MEDIUM |
| N-4 (Phase 0) | `WORKFLOW_*` permissions are organization-level; instances not org-unit scoped | MEDIUM |

### Still the highest-leverage remaining item

**S-1.** Phase 0 fixed the routes that had forgotten their auth guard, but
nothing structurally prevents the next one from forgetting. The pattern that
works in this codebase already exists — `module-scope-conformance.spec.ts`, and
now `telematics-indexes.spec.ts` — and a route-auth conformance test would have
caught two of Phase 0's three authorization findings at PR time.

---

## Testing gaps Phase 1 did not close

- **No concurrency test for the unique telemetry index.** Proving that two
  concurrent upserts on the same tuple produce one row requires a live MongoDB
  with a real unique index; the repository's Jest setup has no database and no
  integration harness (`test:integration` runs `--passWithNoTests`). The index
  *declaration* is asserted statically instead, and the reasoning for why the
  constraint is necessary is recorded on the declaration itself. A simulation
  against `FakeCollection` would prove only that the fake enforces uniqueness,
  which is not the property in question.
- **`test:e2e` and `test:performance` remain `echo` stubs.**
- **No Eagle Track adapter test covers the altitude/accuracy omission** — it is
  covered indirectly by the type change and by the Cartrack suite's equivalent
  assertions.
