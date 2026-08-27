# Ingestion & Retention at Scale

How telemetry gets in, how long it stays, and what runs where.

```
provider ──► scheduler (every 2 min)  ──► sync ──► ingestTelematicsData ──► tbltelematics
                                                          │                      │
live map ──► staleness CHECK ──► enqueue ─┘                │                 TTL (90d)
             (never syncs inline)                          │                      │
                                                    geofence eval           daily rollup
                                                    (cached + bbox)          (kept 730d)
```

**The rule:** reads never write. Ingestion never depends on someone
watching the map.

---

## Retention

| Collection | Kept | Keyed on |
|---|---|---|
| `tbltelematics` | `TELEMETRY_RETENTION_DAYS` (default **90**) | `createdAt` |
| `tbltelematics_daily_rollup` | `TELEMETRY_ROLLUP_RETENTION_DAYS` (default **730**) | `createdAt` |

### Why `createdAt` and not `timestamp`

This is the decision that matters. `timestamp` is the **provider's fix
time**; `createdAt` is **when we stored the row**.

A TTL on `timestamp` would be a data-loss bug. Eagle Track's history
service deliberately backfills *old* readings. A month-old fix ingested
today already sits outside a 90-day window's tail, so Mongo's TTL monitor
would delete it within a minute of it landing. The backfill would run,
report rows written, and leave nothing behind — silently, and only for
the oldest and most valuable part of the range.

**Trade-off, stated:** a bulk backfill of two-year-old history occupies
the full retention window rather than ageing out by domain relevance.
That is the right way round — data arriving and immediately vanishing is
a bug; data outstaying its usefulness is a cost.

### Why 90 days

Covers every reporting window this codebase actually uses (the history
service's max span, the live map's 60-minute staleness horizon, the
monthly/quarterly finance periods). Short enough that a 1,000-vehicle
fleet stabilises around 155M rows instead of growing forever.

### Limitations

- `expireAfterSeconds` is a property of the **index**, so retention is
  platform-wide and cannot vary per tenant. Per-tenant retention would
  need a scheduled deletion job instead.
- **Changing the value requires `collMod`.** `createIndex` with different
  options on the same name raises `IndexOptionsConflict` (85), which
  `ensureIndexes` swallows — so a changed `TELEMETRY_RETENTION_DAYS`
  would silently never apply. `ensureIndexes` now detects a TTL conflict
  and applies the change via `collMod` rather than ignoring it.
- Telemetry is **hard-deleted** by the TTL, never soft-deleted. It is
  append-only operational data, not an audit record.

---

## Rollups

`telemetry-daily-rollup` runs at **01:00 UTC**, aggregating the previous
day into one row per vehicle: fix count, odometer span, max/mean speed,
fuel used, engine-hours span, alert count, first/last fix.

A rollup row is roughly 1/1700th the size of the day it summarises, which
is the whole argument: keep the detail briefly, keep the shape
indefinitely.

**Distance is the odometer SPAN (max − min), not a sum of inter-fix
hops.** Summing hops systematically under-counts — a vehicle that drives
a loop between two fixes reads as having gone nowhere — and one bad GPS
point corrupts the total. The odometer is cumulative and authoritative.

**Absent stays absent.** A day with no odometer readings gets
`distanceKm: undefined`, not `0`; a day with only *one* reading also gets
`undefined`, because a single reading gives a span of zero, which would
assert the vehicle did not move when we only know where it ended up. A
zero odometer is ignored entirely — Phase 1 established that as the
fabricated-default signature, and letting one into `min()` would make the
day's distance the entire vehicle lifetime.

### What this deliberately does not do

**No existing report was changed.** Every current query still reads
`tbltelematics` directly and works unchanged inside the retention window.
Rollups are added *alongside* raw data, not in front of it.

**Trade-off:** until reports are migrated, a query for a window older
than the retention horizon returns empty rather than falling back to
rollups. That is visible and fixable. Silently serving aggregates where a
report promised detail is neither.

---

## Geofence evaluation

Evaluation runs on every fix. It used to begin with two unconditional
Mongo queries — ~2,400 queries/minute at 1,000 vehicles on a 50-second
cadence, paid in full even by tenants that have never drawn a geofence.

Three cheap layers, each removing work from the next:

1. **Tenant-level cache** of active geofences, 30s TTL. A tenant with no
   geofences costs **zero** queries per ping after the first.
2. **Bounding-box prefilter** — four float comparisons against boxes
   precomputed at cache-fill. A vehicle driving across a city touches no
   box, so point-in-polygon never runs.
3. **State query only for candidates**, and only about those geofences.

Net: a ping nowhere near a boundary costs ~0 queries instead of 2; one
near a boundary costs 1.

**The prefilter fails towards evaluating.** A shape that cannot be
bounded (a `route` geofence) returns a `null` box and always proceeds. A
prefilter that skips is a missed alert — the failure nobody notices until
an asset leaves a site and nothing fires. One that over-includes costs a
single geometry call.

**Cache staleness:** the cache is per-process, so an edit takes up to
30s to be seen everywhere. Acceptable because geofences change on a human
timescale, and every write path — create, update, delete, and the Eagle
Track trigger sync — calls `invalidateTenantGeofences`. It deliberately
does **not** use the shared query cache in `infrastructure/cache/`, which
is invalidate-only (audit F-9) and keyed by tenant only.

---

## Read path vs write path

The live map read used to run a **full Eagle Track sync inline** — roster
fetch, status fetch, driver and trigger sub-syncs, device registration
and N telemetry inserts — before responding. Three consequences:

1. p99 map latency was bounded by **vendor** latency.
2. Read load amplified into vendor load.
3. **With no map open, nothing was ingested.** Freshness depended on
   somebody watching — which is exactly when an alert matters least.

Now the read:

- reads the local store;
- decides whether the data is stale;
- at most **enqueues** a background refresh;
- returns what it has, plus `dataStale` and `refreshRequested`.

It never calls the provider and never writes telemetry.

**Queue unreachable → fail safe.** The old fallback ran the sync anyway
with only in-process de-duping, so N serverless instances each started
their own vendor call. Now the refresh is skipped and the data is
reported stale — the honest outcome. No database-backed lock was added:
the only thing needing coordination is job enqueueing, and BullMQ's
`jobId` de-duplication already provides it (job ids are bucketed to the
staleness window, so every request inside one window computes the same
id).

`refreshRequested: false` alongside `dataStale: true` is the signal that
we could not arrange a refresh. Worth distinguishing from "old data, help
is coming".

---

## Scheduling topology

| Path | Cadence | Role |
|---|---|---|
| `bootstrap-schedules.ts` → BullMQ worker | **every 2 min** | **The real ingestion path** |
| `vercel.json` cron → `/api/cron/eagletrack-sync` | **every 5 min** | Trigger for deployments with no worker |
| Live-map read → enqueue | on demand, ≤1 per 50s per tenant | Top-up while a user is watching |

The Vercel cron was `0 0 * * *` — **once daily** — while the read-through
service's own comment said per-minute was needed. It is now `*/5 * * * *`.

**Vercel Hobby only permits daily crons.** On Hobby, the cron is not a
usable ingestion path at all and the worker is mandatory. On Pro, `*/5`
works and is a reasonable backstop — but the worker remains the primary
path, because a 5-minute cron cannot deliver a live map and hammering a
customer-hosted vendor from a serverless fleet is worse than polling it
from one process.

### Running workers

```bash
npm run worker        # all BullMQ workers + outbox processor
```

`workers/bootstrap.ts` no-ops without `REDIS_URL`. That used to be a
`logWarn` in every environment. In production it now logs an **error**
with `WORKERS_DISABLED_NO_REDIS`, because silence there means telemetry
sync, outbox processing, backups, rollups and retention are all not
running while the application serves traffic and looks healthy.

It deliberately does **not** throw: the same module is imported by the
web process, and killing the web tier over a missing worker dependency
would turn a degraded background tier into a total outage.

---

## Backup

Format unchanged: **gzipped NDJSON**, one document per line, each tagged
with `__collection`. Existing restore tooling keeps working.

What changed is how it is produced. It used to push every document into a
`string[]`, `join` it, and Buffer the result — three full copies of the
logical database at the peak (~2–3×), and `join` on a multi-gigabyte
array hits V8's maximum string length before the memory limit, so the job
did not degrade gracefully, it threw.

Now: `documents → NDJSON → gzip → temp file → S3`, connected by
`pipeline()` so backpressure reaches back to the Mongo cursor. Peak
memory is the stream high-water marks regardless of database size.

**Why a temp file rather than streaming straight to S3:** direct
streaming without buffering needs multipart upload
(`@aws-sdk/lib-storage`), which is not a dependency of this project.
Spooling to disk keeps memory bounded, adds no dependency, and lets the
upload declare an exact `ContentLength` from `fstat`. **Cost:** the
worker host needs free disk equal to the *compressed* backup (typically
10–20× smaller than logical size for JSON). The file is removed in a
`finally`, including after an upload failure.

A half-written archive is deleted on error: a truncated backup that
*looks* like a backup is worse than none, because it is only discovered
during a restore.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TELEMETRY_RETENTION_DAYS` | `90` | Raw telemetry retention (min 7) |
| `TELEMETRY_ROLLUP_RETENTION_DAYS` | `730` | Rollup retention; must be ≥ raw |
| `TELEMETRY_RETENTION_ENABLED` | `true` | Opt-out, because unbounded growth is not a safe default |

All validated in `telemetry-retention.config.ts`, which **throws** on a
non-numeric value, a window below the floor, or rollups expiring before
the raw data they summarise. An operator who set `400` for a compliance
requirement must not discover the setting was ignored once the data is
already gone.
