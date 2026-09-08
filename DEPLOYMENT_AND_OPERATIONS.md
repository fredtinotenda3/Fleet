# Deployment and Operations

---

## 1. Shape

- **Next.js 15 App Router** (web + API routes) — Vercel or a container.
- **BullMQ workers** — a separate process (`Dockerfile.worker`). Required:
  without it there is no telemetry sync, no trip generation, no rollups,
  no backups, no scheduled maintenance.
- **MongoDB** (Atlas or self-hosted).
- **Redis** — queues and rate limiting.

The web process alone is a working UI over a fleet that never updates
itself. Deploy both.

---

## 2. Environment

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | yes | |
| `REDIS_URL` | yes for workers | rate limiter falls back to in-memory if unreachable |
| `CRON_SECRET` | yes | guards scheduled routes, fail-closed |
| `TRUSTED_PROXY_HOPS` | recommended | default 1 suits Vercel — see §6 |
| `QUERY_CACHE_ENABLED` | no | **default false**, deliberately |
| `ATTENTION_AUTO_DISPATCH_ENABLED` | no | default off; refuses `'1'`/`'yes'` |
| S3 / storage credentials | for backups | |

Never commit `.env`. It is excluded from every package.

---

## 3. Deploy order

```
1. Rotate any credential that has ever appeared in a shared archive.
2. Deploy the build (web + worker).
3. npm run db:dedupe-telemetry     # dry run, then --apply if needed
4. npm run db:indexes
5. npm run tenancy:backfill        # dry run, then --confirm
6. Verify: log in as a BRANCH MANAGER, not an admin.
```

Step 6 is the one people skip. An org-wide account has
`accessibleOrgUnitIds === null`, so it sees everything and proves
nothing about scoping.

### Index notes

`db:dedupe-telemetry` **before** `db:indexes` on any database predating
the unique telemetry tuple — Mongo refuses a unique index while
duplicates exist, and `ensureIndexes()` reports that loudly rather than
skipping it.

New in this release:
- `uniq_trips_tenant_generation_key` — **partial**, on documents that
  have a `generation_key`. Manual and imported trips have none and may
  legitimately share a start time; a non-partial index would collapse
  them.
- `uniq_trip_detection_state_tenant_vehicle`.

---

## 4. Verifying a build

```bash
npm run type-check
npm test
npm run test:security
npm run test:e2e
npm run test:performance
npm run test:integration   # skipped without a live Mongo
npm run build
```

### `npm run build` fails without internet

`app/layout.tsx` imports Geist via `next/font/google`, which **fetches
from Google at build time**. In an air-gapped or egress-restricted CI
this fails *before compiling any application code*, so a red build there
is not evidence of a code problem.

Options: allow `fonts.googleapis.com` and `fonts.gstatic.com` at build
time, or self-host the font files and drop `next/font/google`. The
second is the better long-term answer and is not yet done.

### Performance tests

Budgets are **calibrated against the machine running them**, not fixed
milliseconds — the same code measured 73 ms in CI and 8,568 ms on a
developer laptop, a 117× spread from `for await` overhead. See
`tests/helpers/perf-calibration.ts`. A failure now means the *shape* of
the work changed, not that the machine was busy.

---

## 5. Workers

`workers/bootstrap.ts` starts every consumer. Queues are named per
domain (`telemetry-jobs`, `report-jobs`, …).

- Failures retry with backoff, then land in `tbldeadletterqueue`.
  **Check that collection after any integration change** — a job that
  quietly stopped is the failure mode this platform has hit most often.
- Scheduled jobs are registered in `server/scheduler/bootstrap-schedules.ts`.
- Per-tenant and per-vehicle failures are isolated deliberately: one bad
  tenant must not stop the sweep for everyone else.

### Multi-instance

Safe. Trip generation is idempotent by deterministic key plus a unique
index; allocation postings likewise. Rate limiting uses Redis — during a
Redis outage it falls back to **in-memory** rather than failing closed,
so the effective limit becomes *limit × instance count*. Stated rather
than left to be discovered: failing closed would turn a cache outage into
a total outage.

---

## 6. Rate limiting and proxies

The limiter keys on a **trusted** hop, not the leftmost
`x-forwarded-for` entry — the client writes that one, so a caller varying
it got a fresh bucket per request and even a perfect store counted
nothing.

Set `TRUSTED_PROXY_HOPS` to the number of proxies **you** control in
front of the app. Too high and a client can spoof its address; too low
and everyone shares one bucket.

---

## 7. Observability

- Structured JSON logs (`infrastructure/monitoring/logger.ts`).
- Prometheus-style metrics; the scrape endpoint fails **closed** on an
  unset token.
- Provider sync duration, availability and stale-vehicle counts per
  provider.
- HTTP latency alerts (`ObservabilityAlertTriggered`) above a threshold.

**Sentry is not working.** `@sentry/nextjs` v6 is incompatible with
Next 15. Errors reach the logs, not Sentry. Known, unfixed.

---

## 8. Backups

Nightly at 02:00 UTC, gzipped NDJSON to object storage. Memory is bounded
by stream high-water marks regardless of database size; the worker host
needs free disk equal to the compressed archive.

**Restore-test them.** The one job whose failure is invisible until you
need it.

---

## 9. Known operational risks

| Risk | Status |
|---|---|
| `next/font` fetches at build time | breaks air-gapped CI |
| Sentry non-functional | v6 vs Next 15 |
| `loadInScope*` fail-open on rows with no `orgUnitId` | fix after backfill — see `SECURITY_MODEL.md` §8 |
| `BaseRepository` `_id` type lie | ~20 `updateOne({_id})` sites would no-op if "fixed" in one pass |
| Historical costs do not re-post to the ledger | see `VALUE_LEDGER_AND_FINANCE_EXPLAINER.md` §7 |
| 24 pre-existing lint errors | unchanged by recent work |
| Allocation ledger has two period semantics | list vs totals; standardise in its own commit |

---

## 10. Rollback

The application is stateless; roll the deployment back.

**Migrations are the exception.** Every repair script writes to
`tbltenant_repair_audit`, and `npm run db:revert <runId>` rolls that run
back, skipping documents changed since. The business-data reset is
**not** reversible — it deletes. Take a backup first, and use the dry run.
