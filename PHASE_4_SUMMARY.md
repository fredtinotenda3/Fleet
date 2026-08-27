# Phase 4 — Ingestion & Retention at Scale

Implemented on top of Phase 0 (security), Phase 1 (telemetry data
integrity), Phase 2 (provider contract) and Phase 3 (event durability).

## Status

| Item | Result |
|---|---|
| Telemetry retention policy | **FIXED** |
| TTL / rollup | **FIXED** |
| Geofence evaluation scale | **FIXED** |
| Read-through writes removed | **FIXED** |
| Cron / worker scheduling | **FIXED** |
| Backup streaming | **FIXED** |
| Phase 0 regression | **PASSED** |
| Phase 1 regression | **PASSED** |
| Phase 2 regression | **PASSED** |
| Phase 3 regression | **PASSED** |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1163 passed / 1163, 71 suites** |
| Baseline 1094 / 67 | **+69 tests, 0 regressions** |
| Phase 0–3 regression (15 suites) | **287 passed / 287** |
| New Phase 4 suites | 21 + 15 + 10 + 19 = **65 passed** |

---

## F-12 — Retention

TTL index on `tbltelematics`, keyed on **`createdAt`**, default **90
days**, configurable via `TELEMETRY_RETENTION_DAYS`.

**Why `createdAt` and not `timestamp` — the decision that mattered.**
`timestamp` is the provider's fix time; `createdAt` is when we stored the
row. A TTL on `timestamp` would be a data-loss bug: Eagle Track's history
service deliberately backfills *old* readings, whose fix time is already
outside a 90-day window's tail, so Mongo's TTL monitor would delete them
within a minute of them landing. The backfill would run, report rows
written, and leave nothing behind — silently, and only for the oldest and
most valuable part of the range.

**Trade-off, stated:** a bulk backfill of two-year-old history occupies
the full retention window rather than ageing out by domain relevance.
That is the right way round — data arriving and immediately vanishing is
a bug; data outstaying its usefulness is a cost.

**A trap found while wiring it.** `ensureIndexes` swallows
`IndexOptionsConflict` (85) — which is exactly what a changed
`TELEMETRY_RETENTION_DAYS` raises on re-run. The new retention would
silently never apply while `db:indexes` reported success. `expireAfterSeconds`
is the one index option Mongo allows changing in place, so a TTL conflict
is now **repaired via `collMod`** rather than ignored.

Configuration is validated and **throws** on a non-numeric value, a
window below the 7-day floor, or rollups expiring before the raw data
they summarise. An operator who set `400` for a compliance requirement
must not discover the setting was ignored once the data is gone.

Telemetry is **hard-deleted** by the TTL, never soft-deleted — it is
append-only operational data, not an audit record.

---

## F-12 — Rollups

`telemetry-daily-rollup` at 01:00 UTC: one row per vehicle per day —
fix count, odometer span, max/mean speed, fuel used, engine-hours span,
alert count, first/last fix. Retained **730 days** (a rollup row is
~1/1700th the size of the day it summarises).

**Distance is the odometer SPAN, not a sum of inter-fix hops.** Summing
hops under-counts systematically — a vehicle that drives a loop between
two fixes reads as having gone nowhere — and one bad GPS point corrupts
the total.

**Absent stays absent** (the Phase 1 rule, applied to aggregates): no
odometer readings → `distanceKm: undefined`, not `0`. *One* reading also
→ `undefined`, because a single reading gives a span of zero, which would
assert the vehicle did not move when we only know where it ended up. A
zero odometer is ignored entirely — letting one into `min()` would make
the day's distance the entire vehicle lifetime.

The worker streams the day sorted by tenant+vehicle and **flushes per
vehicle**, so peak memory is one vehicle-day (~1,700 readings), not one
fleet-day (~1.7M).

**Scope discipline:** no existing report was changed. Rollups are added
*alongside* raw data. The trade-off is stated rather than hidden — until
reports are migrated, a query older than the retention horizon returns
empty rather than falling back to aggregates. Silently serving aggregates
where a report promised detail would be worse.

---

## F-13 — Geofence evaluation

Was two unconditional Mongo queries on **every** fix — ~2,400
queries/minute at 1,000 vehicles, paid in full even by tenants that have
never drawn a geofence.

Three cheap layers: a **30s tenant-level cache** (a tenant with no
geofences costs zero queries per ping after the first), a **bounding-box
prefilter** with boxes precomputed at cache-fill, and the **state query
only for candidates**. Net: ~0 queries per ping away from a boundary, 1
near one.

**The prefilter fails towards evaluating.** An unboundable shape (a
`route` geofence) returns a `null` box and always proceeds. A prefilter
that skips is a missed alert — the failure nobody notices until an asset
leaves a site and nothing fires. One that over-includes costs a single
geometry call.

Every write path — create, update, delete, **and the Eagle Track trigger
sync** — invalidates the cache. Invalidation is at the *repository*
because that is the single choke point; doing it in the service would
have missed the trigger sync, which writes boundaries directly.

---

## F-16 — Read path performs no writes

The live-map read ran a **full Eagle Track sync inline** — roster fetch,
status fetch, sub-syncs, device registration, N telemetry inserts —
before responding. So p99 map latency was bounded by *vendor* latency,
read load amplified into vendor load, and **with no map open nothing was
ingested at all**.

Now the read checks staleness, at most **enqueues** a background refresh,
and returns what it has plus `dataStale` / `refreshRequested`. It never
calls the provider and never writes telemetry.

**Queue unreachable → fail safe.** The old fallback ran the sync anyway
with only in-process de-duping, so N serverless instances each started
their own vendor call. Now the refresh is skipped and the data is
reported stale. No database-backed lock was added: the only thing needing
coordination is enqueueing, and BullMQ's `jobId` de-duplication provides
it (ids bucketed to the staleness window).

---

## F-21 — Scheduling

| Path | Cadence | Role |
|---|---|---|
| BullMQ scheduler | every 2 min | **The real ingestion path** |
| `vercel.json` cron | **`*/5`** (was `0 0 * * *`, daily) | Trigger where no worker runs |
| Live-map enqueue | ≤1 per 50s per tenant | Top-up while watched |

**Vercel Hobby only permits daily crons** — there the cron is not a usable
ingestion path and the worker is mandatory. Documented rather than worked
around.

`workers/bootstrap.ts` no-ops without `REDIS_URL`; that was a `logWarn`
in every environment. In **production** it now logs an error
(`WORKERS_DISABLED_NO_REDIS`), because silence there means telemetry
sync, outbox processing, backups, rollups and retention are all not
running while the app looks healthy. Deliberately **not** a throw — the
same module is imported by the web process, and killing the web tier over
a missing worker dependency turns a degraded background tier into a total
outage.

---

## F-20 — Backup streaming

Format **unchanged** (gzipped NDJSON, `__collection` per line), so
existing restore tooling keeps working. Only the production changed:
`documents → NDJSON → gzip → temp file → S3`, connected by `pipeline()`
so backpressure reaches the Mongo cursor. Peak memory is stream
high-water marks regardless of database size.

The old version built a `string[]` of the whole database, joined it, and
Buffered the result — ~2–3× the logical size at peak, and `join` on a
multi-gigabyte array hits V8's max string length before the memory limit,
so it did not degrade gracefully, it threw.

**Why a temp file rather than straight to S3:** direct streaming needs
multipart upload (`@aws-sdk/lib-storage`), which is not a dependency.
Spooling to disk keeps memory bounded, adds no dependency, and lets the
upload declare exact `ContentLength` from `fstat`. **Cost:** the worker
host needs free disk equal to the *compressed* backup. The file is
removed in a `finally`, including after upload failure.

A half-written archive is deleted on error: a truncated backup that
*looks* like a backup is worse than none, because it is only discovered
during a restore.

**A real bug my own test caught:** I first wrote
`{__collection: name, ...doc}`. Later keys win in an object literal, so
any document could override its own routing tag and a restore would
replay it into whatever collection it claimed. Fixed by spreading first.

---

## Files

**New (9)**
```
modules/telematics/services/telemetry-retention.config.ts   retention config; fail-closed
modules/telematics/services/geofence-evaluation.ts          cache + bounding boxes
modules/telematics/services/telemetry-rollup.service.ts     daily aggregation (pure)
infrastructure/storage/backup-stream.ts                     backpressure-aware writer
docs/INGESTION_AND_RETENTION.md                             architecture + topology
tests/unit/telematics/telemetry-retention-and-rollup.spec.ts   21 tests
tests/unit/telematics/geofence-scale.spec.ts                   15 tests
tests/unit/infrastructure/backup-streaming.spec.ts             10 tests
tests/security/ingestion-scale-guards.spec.ts                  19 tests
```

**Modified (16)**
```
infrastructure/database/indexes.telematics-addendum.ts  TTL + rollup indexes
infrastructure/database/indexes.ts                      collMod repair for TTL changes
infrastructure/storage/storage.service.ts               + uploadStream (disk -> S3)
infrastructure/queue/queue.service.ts                   + TELEMETRY_ROLLUP job type
modules/telematics/services/telematics.service.ts       geofence cache + prefilter
modules/telematics/repositories/telematics.repository.ts  rollup stream/upsert, invalidation
modules/telematics/services/eagletrack-read-through.service.ts  now a checker, not a writer
modules/telematics/services/live-map.service.ts         check-and-enqueue
modules/telematics/types/live-map.types.ts              + dataStale, refreshRequested
server/scheduler/bootstrap-schedules.ts                 + daily rollup schedule
workers/telemetry.worker.ts                             + rollup handler (streamed)
workers/backup.worker.ts                                streamed backup
workers/bootstrap.ts                                    loud in production without Redis
vercel.json                                             cron daily -> */5
tests/security/telematics-indexes.spec.ts               TTL exemptions documented
tests/security/telematics-provider-extensibility.spec.ts  read-path guards
```

**Two existing tests were updated, deliberately.**
`telematics-provider-extensibility.spec.ts` listed the read-through
service as a "polling caller" that must resolve the provider through the
registry — Phase 4 removed the sync entirely, so it no longer resolves a
provider because it no longer calls one. The Phase 2 invariant (never
import an adapter singleton) is still asserted, alongside the stronger
Phase 4 property. `telematics-indexes.spec.ts` correctly flagged the two
new TTL indexes as undocumented exceptions to the tenant-prefix rule; a
TTL index must be single-field on the date, so they are now named
exemptions rather than a loosened rule.

---

## Manual steps

1. `npm ci`
2. `npm run db:indexes` — creates the TTL index on `tbltelematics` and
   the rollup collection's indexes.
   **This begins deleting telemetry older than `TELEMETRY_RETENTION_DAYS`
   as soon as Mongo's TTL monitor next runs (within ~60s).** If you need
   a longer window, set `TELEMETRY_RETENTION_DAYS` *before* running it.
3. Ensure a worker process runs (`npm run worker`) — it is now the
   primary ingestion path, not a backstop.
4. If on Vercel Hobby, the `*/5` cron will be rejected; the worker is
   mandatory there.

No backfill. Rollups begin accruing from the first nightly run; historical
days are not retro-aggregated (a one-off script could, but backfilling
aggregates for windows whose raw data may already be gone would produce
silently incomplete rows).

Phase 1–3 steps (`db:dedupe-telemetry`, `db:backfill-device-provider`,
outbox topology) are unaffected and still required if not yet run.

---

## Remaining

See `PHASE_4_REMAINING_FINDINGS.md`. The ones worth naming:

- **Reports still read raw telemetry**, so queries older than the
  retention horizon return empty rather than using rollups. Deliberate:
  migrating reports is a behavioural change belonging in its own phase.
- **The geofence cache is per-process.** A geofence edit takes up to 30s
  to be seen in *other* instances. Bounded, documented, and mitigated by
  invalidation on every write path.
- **No test against a real MongoDB.** The TTL, `collMod` repair, unique
  rollup key and cursor streaming are asserted structurally and against
  in-memory doubles. Stated in the suite headers, not left to infer.
