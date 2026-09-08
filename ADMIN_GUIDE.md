# Administrator Guide

For the person who sets a tenant up, keeps it healthy, and runs the
migrations. Assumes shell access and a `MONGODB_URI`.

---

## 1. Setting up a new customer

The order is not a suggestion — skipping a step does not error, it
produces a module that looks empty.

1. **Organization** — `POST /api/organizations`. Note: this is
   self-service and sets `ownerId` from the **caller**, so the admin who
   submits the form becomes the owner.
2. **Org units** — Administration → Organization. Build the
   Branch → Department → Workshop → Fleet tree *before* anything else;
   every operational record inherits its scope from it.
3. **Members and scope assignments** — a user with no assignment is
   fail-closed: they see nothing and cannot create anything that has no
   vehicle.
4. **Vehicles** — the spine. Nothing referencing a vehicle can be
   recorded first.
5. **Drivers, reference data** — fuel stations, expense types, fuel cards.
6. **Telematics** — provider credentials, then device/vehicle links.

Full rationale and per-module detail: `DATA_ENTRY_GUIDE.md`.

---

## 2. Roles

| Role | Scope | Notes |
|---|---|---|
| `super_admin` | platform | The **only** role that may read across tenants. |
| `organization_owner` | one org | `AuthContext.isSuperAdmin` is **also true** for this role — which is why platform endpoints check the literal `SUPER_ADMIN`. |
| `organization_admin` | one org | org-wide visibility (`accessibleOrgUnitIds === null`) |
| `branch_manager` | a branch + descendants | |
| `department_manager`, `fleet_manager`, `workshop_manager` | their unit + descendants | |
| `dispatcher`, `accountant`, `auditor`, `mechanic`, `driver`, `viewer` | narrowed | |

Custom roles live in `tblcustomroles` and resolve within the same tenant.

> **Org-wide roles see everything.** When someone reports "I can't see
> my data", check their assignment first — and never validate a scoping
> fix from an org-wide account.

---

## 3. Migrations and repair scripts

All are **dry-run by default**. All write to `tbltenant_repair_audit`, and
`npm run db:revert` rolls a run back.

### `npm run tenancy:backfill` — fill missing `orgUnitId`

**Run this first on any existing database.** Rows written before org-unit
scoping (or before the write-scope fixes) carry no `orgUnitId` and are
invisible to every scope-narrowed user.

```bash
npm run tenancy:backfill                        # dry run
npm run tenancy:backfill -- --confirm           # apply
npm run tenancy:backfill -- --collections a,b   # narrow
npm run tenancy:backfill -- --org <slug>        # one organization
```

Only ever **fills a missing** value — it can never move a row between
units. Modules whose `orgUnitSource` is `explicit` (drivers, workshop,
dispatch, inventory, procurement) have no join to follow; those rows are
**reported, never guessed**. Resolve them with `npm run db:assign`.

### `npm run db:indexes` — create indexes

Required after any upgrade that adds one. Notably:

- `uniq_trips_tenant_generation_key` (partial) — the real idempotency
  guarantee for generated trips.
- `uniq_trip_detection_state_tenant_vehicle`.
- the partial unique index on `idempotencyKey` for allocation postings.

> `npm run db:dedupe-telemetry` **must** run before `db:indexes` on any
> database that predates the unique telemetry tuple — Mongo refuses a
> unique index while duplicates exist.

### `npm run db:reset-business-data` — clear operational data

Clears the fleet and everything derived from it; **keeps** accounts,
organizations, org units, roles, permissions, workflow and rule
definitions, report templates and integration credentials.

```bash
npm run db:reset-business-data -- --tenant <slug>             # dry run
npm run db:reset-business-data -- --tenant <slug> --confirm   # apply
npm run db:reset-business-data -- --confirm --yes-all-tenants # every tenant
```

Safety properties, all asserted by
`tests/security/reset-business-data-classification.spec.ts`:

- **Never drops a collection** — `deleteMany` only, so indexes and
  validators survive.
- **Refuses to run if any collection is unclassified.** Defaulting either
  way is dangerous: to CLEAR silently deletes new customer config, to
  PRESERVE silently leaves operational data behind so the reset is not
  one.
- **Refuses a multi-tenant database** without `--tenant` or an explicit
  `--yes-all-tenants`.
- **Preserves the audit log** — clearing it would destroy the record of
  the reset itself.
- Prints a full manifest with per-collection counts **before** deleting.

> `tbltrip_detection_state` is cleared alongside `tbltrips`. If it were
> not, every watermark would sit in the future, the sweep would skip all
> existing telemetry, and **no trips would ever regenerate** — silently.

### Other scripts

| Command | Purpose |
|---|---|
| `npm run db:forensics` | read-only tenancy contamination report |
| `npm run db:repair` | repair contaminated `tenantId` values |
| `npm run db:assign` | operator-declared ownership for ambiguous rows |
| `npm run db:revert` | roll back any audited run |
| `npm run tenancy:report` | unconfirmed scope decisions |
| `npm run tenancy:rebuild` | authoritative org tree rebuild (demo/test) |
| `npm run db:backfill-alert-orgunits` | historical telematics alerts |
| `npm run db:backfill-device-provider` | device → provider mapping |
| `npm run auth:doctor` | diagnose a login failure |

---

## 4. Telematics providers

Providers are registered in a fail-closed registry; an unknown provider
id **throws** rather than silently doing nothing.

- Credentials live per tenant (`tblexternal_providers`, and the
  per-vendor config collections). They are **preserved** by the reset
  script.
- Sync runs every 2 minutes per provider, enumerating only tenants with
  that integration **enabled** — never every organization.
- One tenant's failure never stops the sweep for others: Eagle Track is
  deployed per customer, so each tenant points at a different host.

### Monitoring provider health

- `provider_available` and sync duration histograms are recorded per
  provider per tenant.
- `fleet_telematics_stale_vehicles{provider}` is published every 15
  minutes; the horizon is `STALE_VEHICLE_HORIZON_MINUTES` (default 60).
- A sweep with per-vehicle errors is a **partial success** and is
  recorded as success — counting it as failure would make the
  availability signal flap on one bad vehicle and train operators to
  ignore it.
- Failed jobs land in `tbldeadletterqueue`. Check it after any
  integration change.

### Trip generation

Runs every 10 minutes (`generate-trips`). Idempotent and re-runnable.
Tuning lives in `DEFAULT_TRIP_DETECTION_CONFIG`:

| Setting | Default | Meaning |
|---|---|---|
| `movingSpeedKmh` | 5 | below this is GPS jitter, not motion |
| `stopMinutes` | 5 | stationary this long ends a trip |
| `signalGapMinutes` | 60 | silence longer than this ends it at the last fix |
| `minTripMinutes` / `minTripKm` | 2 / 0.5 | discard yard shuffling (must fail **both**) |

> If your trackers report **less often than hourly**, lower
> `signalGapMinutes` deliberately. Leaving it at 60 with a slower cadence
> fragments every journey into single-fix stubs that are then discarded —
> producing **no trips at all**, silently. This exact failure occurred at
> the original default of 30.

---

## 5. Scheduled jobs

| Job | Cadence |
|---|---|
| provider sync (per provider) | `*/2 * * * *` |
| `generate-trips` | `*/10 * * * *` |
| offline device detection | `*/10 * * * *` |
| stale vehicle counts | `*/15 * * * *` |
| SLA processing | `*/5 * * * *` |
| telemetry daily rollup | `0 1 * * *` |
| nightly backup | `0 2 * * *` |
| session / notification / outbox cleanup | `0 3–5 * * *` |
| compliance status recompute | `0 6 * * *` |

Scheduled HTTP routes are guarded by `CRON_SECRET` (timing-safe,
fail-closed).

---

## 6. Backups

Streaming gzipped NDJSON, one document per line with its
`__collection`. Peak memory is the stream high-water marks — a few
hundred KB — regardless of database size.

The worker host needs free disk equal to the **compressed** backup
(typically 10–20× smaller than the logical size). The temp file is
removed in a `finally`, so a failure cannot leave one behind.

> A **truncated** backup that looks like a backup is worse than no
> backup, so a failed write deletes the partial archive rather than
> leaving it.

Verify restores. An untested backup is a hypothesis.

---

## 7. Health checks

```bash
npm run type-check
npm run test:security     # tenancy, scope, redaction, wiring guards
npm run db:forensics      # read-only contamination report
npm run tenancy:report    # unconfirmed scope decisions
npm run auth:doctor       # login diagnosis
```

### When a user reports missing data

1. Are they assigned to an org unit? (no assignment = sees nothing, by
   design)
2. Do the records carry `orgUnitId`? → `npm run tenancy:backfill` dry run
3. Does the **vehicle** have an org unit? Everything inherits from it.
4. Are you comparing against an org-wide account? That proves nothing.

---

## 8. Operator actions still outstanding

- **Rotate credentials** found in earlier archives (Eagle Track token, a
  second vendor token, a hardcoded Atlas password). Purged from the tree;
  rotation is external.
- Decide `TRUSTED_PROXY_HOPS` for your topology (default 1 suits Vercel).
- Run `npm run tenancy:backfill`, then consider tightening the
  `loadInScope*` guards — see `SECURITY_MODEL.md` §8. **Backfill first**,
  or you lock everyone out of legacy rows.
