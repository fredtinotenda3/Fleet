# EagleTrack automatic sync (no more manual POST)

## Symptom

The live map only ever showed fresh EagleTrack data right after someone
manually ran `POST /api/telematics/eagletrack/sync` (from DevTools/curl).
Left alone, positions went stale even though the live map frontend
already polls the Fleet API every ~10s
(`frontend/modules/telematics/hooks/useLiveMap.ts`) — the frontend was
polling a backend that was never being fed.

## Root cause

The automatic side of the pipeline already existed on paper:

- `infrastructure/queue/queue.service.ts` declares `JobType.EAGLETRACK_SYNC`.
- `server/scheduler/bootstrap-schedules.ts` registers a
  `telemetry-eagletrack-sync` BullMQ repeatable job, every 2 minutes.
- `workers/telemetry.worker.ts`'s `'eagletrack-sync'` branch already
  calls `eagletrackConfigRepository.listEnabledTenantIds()` and
  `eagletrackAdapter.syncOrganization(tenantId)` per tenant.

But per `workers/bootstrap.ts`'s own doc comment, all of that is
"intended to run in a dedicated worker process ... since long-lived
BullMQ Worker connections don't fit a serverless request/response
lifecycle." Nothing in this Vercel serverless deployment ever calls
`bootstrapWorkers()`. No process ever starts a BullMQ `Worker` for the
`telemetry-jobs` queue, so the repeatable job's enqueues accumulate
unprocessed and nothing ever syncs on its own. The manual sync route
worked because it calls `eagletrackAdapter.syncOrganization` directly,
bypassing the queue entirely.

## Fix

Added a Vercel-Cron-triggered route that performs the sync directly —
no queue, no BullMQ Worker required — since that's the mechanism that
actually fits a serverless deployment. This was chosen over the other
two options considered:

- **Vercel Cron → protected route (chosen).** Fixes the actual gap (no
  BullMQ consumer), reuses the exact same `eagletrackAdapter.syncOrganization`
  call the manual route and the (dormant, on this deployment) worker
  branch already use, adds no per-request latency to the live map or
  vehicle-detail endpoints, and needs no new invalidation/debounce logic
  beyond a simple run lock. Freshness ceiling is the cron interval (1
  minute), which is finer than the live map's own 10s poll needs to
  render anyway, and finer than the 2-minute interval the (non-functional)
  BullMQ schedule was already configured for.
- **Read-through refresh on the live-map/vehicle-detail endpoints.**
  Would add an EagleTrack round-trip to the hot request path (or a
  background fire-and-forget from it), and — because Vercel serverless
  instances don't share in-process state — needs its own Redis-based
  debounce to stop concurrent viewers from each triggering a sync,
  which is strictly more moving parts than the cron approach for no
  freshness benefit here (live map polling is already 10s; EagleTrack
  itself is not sub-minute telemetry).
- **Hybrid (cron + read-through).** Combines both sets of moving parts
  for ~30s vs. ~60s freshness — not worth the added surface for this
  data source.

### New: `app/api/cron/eagletrack-sync/route.ts`

`GET /api/cron/eagletrack-sync`, called by Vercel Cron (see
`vercel.json`) every minute.

- **Auth**: same `Authorization: Bearer $CRON_SECRET` convention as the
  platform's other cron endpoints (`/api/reminders/notify-overdue`,
  `/api/reminders/update-status`, `/api/workflows/process-timeouts`,
  `/api/security/expire-grants`).
- **Sync logic**: walks `eagletrackConfigRepository.listEnabledTenantIds()`
  and calls `eagletrackAdapter.syncOrganization(tenantId)` per tenant,
  inside a per-tenant `try/catch` — identical shape to (and reusing the
  same adapter as) the manual sync route and the worker branch. One
  tenant's unreachable Eagle Track deployment never stops the sweep for
  the rest.
- **Idempotency / no duplicate syncs**:
  1. A Redis `SET NX PX` lock wraps the whole run (55s TTL, under the
     1-minute cron interval) so an overlapping invocation — a slow run
     still in flight, a retried cron delivery, or someone hitting the
     URL by hand — skips instead of running a second full sweep. The
     lock is released with a compare-and-delete Lua script so a run can
     only ever clear its own lock.
  2. A secondary per-tenant check skips any tenant whose
     `lastSyncAt` (written by `eagletrackConfigRepository.recordSyncResult`,
     called from inside `eagletrackAdapter.syncOrganization` itself) is
     under 20 seconds old, guarding against this cron and a manual sync
     landing on the same tenant back-to-back.
  3. Redis is optional platform-wide. If the lock can't be acquired
     because Redis is unreachable, the route fails **open** (logs a
     warning, runs the sync anyway) rather than leaving the live map
     stale over an unrelated Redis outage — the adapter's own
     timestamp-based staleness guard (`eagletrack.adapter.ts`'s
     `ingestStatus`) is still the backstop against duplicate points from
     a genuine double-run.
- Returns a JSON summary (`tenantsProcessed`, `tenantsSynced`,
  `tenantsSkipped`, `tenantsFailed`, `totalMatched`, `perTenant`) for
  observability, matching the response shape of the existing cron
  routes.

### `vercel.json`

Added:
- `crons: [{ path: "/api/cron/eagletrack-sync", schedule: "* * * * *" }]`
- `functions["app/api/cron/eagletrack-sync/route.ts"].maxDuration = 60`
  (mirrors the existing `app/api/ai/dashboard/route.ts` entry — the
  per-tenant loop makes real outbound HTTP calls per Eagle Track
  deployment and needs headroom beyond the default timeout).

## Left unchanged (by design)

- **`app/api/telematics/eagletrack/sync/route.ts`** (manual sync) — untouched.
  Still useful right after saving credentials, without waiting for the
  next cron tick.
- **`workers/telemetry.worker.ts`** and **`server/scheduler/bootstrap-schedules.ts`**
  — untouched. Correct as-is for a deployment that *does* run a
  dedicated worker process (see `docker-compose.yml`'s `worker`
  service); `tests/unit/telematics/eagletrack-worker-wiring.spec.ts`
  pins that file's exact structure, so no refactor was made there even
  though the new route's per-tenant loop is structurally similar.
- Token query-string auth, the `user=<username>` selector, vehicle
  matching, the staleness guard, Cartrack, and multi-tenancy scoping —
  none of these were touched; the change is additive (one new trigger
  path calling the existing, unmodified `syncOrganization`).

## Environment variables

| Variable | Status | Purpose |
|---|---|---|
| `REDIS_URL` | Already set in Vercel production | Used for the cron run's overlap lock (`SET NX PX` + Lua compare-and-delete unlock). Optional at the code level — if absent or unreachable, the route logs a warning and still runs the sync (fails open), consistent with how the rest of this codebase treats Redis as optional. |
| `CRON_SECRET` | **New — must be set in Vercel production** | Authenticates Vercel Cron's request to `GET /api/cron/eagletrack-sync`, same convention as the platform's other cron routes. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on Cron Job requests when this env var is configured. If left unset, the route falls back to allowing unauthenticated requests (matching the existing `if (CRON_SECRET && ...)` pattern in the other four cron routes) — set it in production. |

## Validation

- `npx tsc --noEmit` — 0 errors.
- `npm run test:security` — 38 suites / 499 tests passing.
- `npx jest` — 45 suites / 679 tests passing.
- `npm run build` — fails in this sandbox only on an unrelated,
  pre-existing issue: `app/layout.tsx` fetches the `Geist`/`Geist Mono`
  fonts from `fonts.googleapis.com` at build time, and that domain is
  not reachable from this sandbox's network egress list. This is
  untouched by this change (verified `app/layout.tsx` is not part of
  this diff) and is a build-environment network restriction, not a
  compile error in the new code — `tsc --noEmit` already confirms the
  new route type-checks cleanly.
