# Phase 7 Follow-Ups

Two follow-ups to the Phase 7 observability work:

1. `/api/observability/metrics` now fails **closed**.
2. `fleet_telematics_stale_vehicles{provider}` is now actually populated by a scheduled job.

Both are covered by new automated tests. `npm ci && npm run type-check && npm test` all pass (78 test suites / 1325 tests, 0 failures; `tsc --noEmit` clean).

---

## 1. `/api/observability/metrics` fails closed

### The bug

```ts
const requiredToken = process.env.METRICS_SCRAPE_TOKEN;
if (requiredToken) {
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== requiredToken) return 401;
}
```

`if (requiredToken && ...)` is exactly the Phase 0, F-1 shape: an **unset** `METRICS_SCRAPE_TOKEN` skips the check entirely, and the endpoint serves every metric — including per-provider telematics health — to anyone who can reach the deployment.

### The fix

- **New file:** `server/middleware/metrics-auth.ts` — a fail-closed bearer-token authorizer for this one route, modeled directly on `server/middleware/cron-auth.ts` (the Phase 0, F-1 primitive already used by five scheduler-invoked routes).
  - `authorizeMetricsRequest(req)` returns `'authorized' | 'misconfigured' | 'unauthorized'`.
  - `denyMetricsRequest(req)` renders a non-authorized result: **500** with `code: 'METRICS_SCRAPE_TOKEN_NOT_CONFIGURED'` when unset, **401** with `code: 'UNAUTHORIZED'` otherwise, or `null` when authorized.
  - A whitespace-only token counts as absent (same reasoning as `cron-auth.ts`: a dashboard-entered `" "` would otherwise look configured while being trivially guessable).
- **Reuses the Phase 0 timing-safe helper.** `cron-auth.ts`'s `timingSafeEquals` (SHA-256 digest + `crypto.timingSafeEqual`, so comparison time is independent of both the length and the content of the presented value) is now `export`ed and imported by `metrics-auth.ts` rather than re-implemented.
- **`app/api/observability/metrics/route.ts`** now does nothing but `const denied = denyMetricsRequest(req); if (denied) return denied;` — it no longer reads `METRICS_SCRAPE_TOKEN` or compares anything itself.
- **No logging of the token.** Every `monitoring.log*` call in `metrics-auth.ts` passes only a static message and a route-name context object — never the `configured` (env) or `presented` (header) value.

### Tests — `tests/security/metrics-endpoint-fail-closed.spec.ts` (19 tests)

Same two-part structure as the existing `tests/security/cron-auth-fail-closed.spec.ts`:

- **Behavioral**, against `authorizeMetricsRequest` / `denyMetricsRequest` directly:
  - unset token → `misconfigured` / 500, even if a bearer token is presented anyway
  - whitespace-only token → treated as absent
  - missing `Authorization` header → `unauthorized` / 401
  - incorrect token → `unauthorized` / 401
  - correct token → `authorized` / no denial
  - the configured token never appears in a result object or a log call, across every outcome
- **End-to-end**, importing the real route `GET` handler with a fake `NextRequest`:
  - missing token → 500, body contains no `fleet_` metric lines
  - missing header → 401
  - wrong token → 401
  - correct token → 200, body contains `fleet_` metric lines
  - the real token never appears in any response body, success or failure
- **Structural**:
  - the route file contains `denyMetricsRequest(req)` and imports it from `@/server/middleware/metrics-auth` — i.e. it isn't reimplementing the check
  - the route no longer contains `process.env.METRICS_SCRAPE_TOKEN`, a naive `provided !== requiredToken` comparison, or the `if (TOKEN && ...)` fail-open shape
  - `metrics-auth.ts` imports and uses `timingSafeEquals` from `cron-auth.ts`, and `cron-auth.ts` still exports it
  - neither the `configured` nor `presented` variable is ever passed as an argument to a `monitoring.log*` call (bracket-depth scan, not a naive regex, so a nested `new Error(...)` call can't create a false boundary, and string/template literals are stripped first so the English word "configured" inside a message doesn't false-positive)

---

## 2. `fleet_telematics_stale_vehicles{provider}` is now populated

### The gap

The gauge was registered in Phase 7 (`infrastructure/observability/metrics.registry.ts`) and the recorder existed (`TelematicsObservabilityService.recordStaleVehicles`), but nothing ever called it — the metric sat at `0` forever, which reads identically to "every vehicle is fine" on a dashboard.

### The fix

- **New config — `modules/telematics/services/stale-vehicle.config.ts`:**
  `getStaleVehicleHorizonMinutes()` reads `STALE_VEHICLE_HORIZON_MINUTES` (default **60**), refusing (not silently defaulting) a non-integer or a value below `MIN_STALE_VEHICLE_HORIZON_MINUTES` (1) — same "refuse, don't silently default" pattern as `telemetry-retention.config.ts`.
- **New pure service — `modules/telematics/services/stale-vehicle-detection.service.ts`:**
  `detectStaleVehicles(deps?)` — injectable `counter` / `recorder` / `listProviders` / `horizonMinutes` / `now`, so it's exhaustively testable with fakes and no Mongo/BullMQ. For each registered provider it:
  1. computes `cutoff = now - horizonMinutes`
  2. calls `counter.countStaleDevicesByProvider(providerId, cutoff)`
  3. calls `recorder.recordStaleVehicles(providerId, count)` — **`providerId` and `count` only**, never `tenantId` or `vehicleId`
  One provider's failure is caught and logged; it does not stop the others from being measured.
- **New repository method** — `TelematicsRepository.countStaleDevicesByProvider(providerId, cutoff)` in `modules/telematics/repositories/telematics.repository.ts`: `db.collection('tbltelematics_devices').countDocuments({ providerId, isDeleted: { $ne: true }, lastFixAt: { $lt: cutoff } })`. Platform-wide, not tenant-scoped — a **count**, matching the cardinality rule already documented in `metrics.registry.ts`'s Phase 7 header. Devices with no `lastFixAt` at all are not counted (`$lt` against a missing field matches nothing in MongoDB).
- **New `JobType.DETECT_STALE_VEHICLES`** (`infrastructure/queue/queue.service.ts`), routed to the existing `telemetry-jobs` queue alongside every other telematics job.
- **New default schedule** in `server/scheduler/bootstrap-schedules.ts`: `telemetry-stale-vehicles`, cron `*/15 * * * *` (every 15 minutes), same idempotent bootstrap/reconcile path every other default schedule uses.
- **`workers/telemetry.worker.ts`** dispatches `jobName === 'detect-stale-vehicles'` to a thin private method that lazily imports and calls `detectStaleVehicles()`, then records the same `recordScheduledRun(jobName, true)` heartbeat every other scheduled sweep in this worker records (so a stopped sweep is visible via `fleet_scheduled_job_last_run_timestamp`, per the existing Phase 7 cron-heartbeat convention).

### Tests

**`tests/unit/telematics/stale-vehicle-detection.spec.ts`** (behavioral, no Mongo/BullMQ):
- config: default 60, explicit override, empty string treated as unset, refuses non-numeric / below-minimum / non-integer values
- `detectStaleVehicles` calculates stale counts for `cartrack` and `eagletrack` (and, separately, an arbitrary N providers — not hardcoded to two)
- `recordStaleVehicles` is called with the correct `(providerId, count)` for each provider, and with **exactly** two arguments (no third argument that could smuggle a tenant/vehicle label)
- cutoff is derived correctly from `now - horizonMinutes`, both when injected and when read from `STALE_VEHICLE_HORIZON_MINUTES`
- one provider's repository failure doesn't stop the sweep for the rest
- the registered `fleet_telematics_stale_vehicles` gauge's `labelNames` is exactly `['provider']` — not `tenantId`, not `vehicleId` (checked against the real `metricsRegistry`, not just the recorder's call signature)

**`tests/unit/telematics/stale-vehicle-job-wiring.spec.ts`** (structural, filesystem-based — same technique as `tests/unit/telematics/eagletrack-worker-wiring.spec.ts`, so it doesn't have to import BullMQ/Redis/Mongo to prove a property about the source):
- `JobType.DETECT_STALE_VEHICLES` exists and is routed to `telemetry-jobs`
- the default schedule exists with cron `*/15 * * * *`
- the worker dispatches `jobName === 'detect-stale-vehicles'` and calls into the detection service
- the branch records a `recordScheduledRun(jobName, true)` heartbeat
- `countStaleDevicesByProvider` filters by `providerId` and `lastFixAt` and never by `tenantId`

---

## Files changed / added

**New:**
- `server/middleware/metrics-auth.ts`
- `modules/telematics/services/stale-vehicle.config.ts`
- `modules/telematics/services/stale-vehicle-detection.service.ts`
- `tests/security/metrics-endpoint-fail-closed.spec.ts`
- `tests/unit/telematics/stale-vehicle-detection.spec.ts`
- `tests/unit/telematics/stale-vehicle-job-wiring.spec.ts`
- `PHASE_7_FOLLOWUPS_SUMMARY.md` (this file)

**Modified:**
- `app/api/observability/metrics/route.ts` — delegates to `denyMetricsRequest`
- `server/middleware/cron-auth.ts` — `timingSafeEquals` is now exported for reuse
- `infrastructure/queue/queue.service.ts` — new `JobType.DETECT_STALE_VEHICLES`, mapped to `telemetry-jobs`
- `server/scheduler/bootstrap-schedules.ts` — new `telemetry-stale-vehicles` default schedule
- `workers/telemetry.worker.ts` — new `detect-stale-vehicles` dispatch branch
- `modules/telematics/repositories/telematics.repository.ts` — new `countStaleDevicesByProvider`

## Verification

```
npm ci
npm run type-check   # tsc --noEmit — clean
npm test             # 78 suites / 1325 tests passed, 0 failed
```

No `.env`, `node_modules`, `.next`, or real secrets are included in the follow-up package. `STALE_VEHICLE_HORIZON_MINUTES` and `METRICS_SCRAPE_TOKEN` are referenced by name only — no values are committed anywhere.
