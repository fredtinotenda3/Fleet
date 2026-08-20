# EagleTrack: on-demand read-through refresh (Vercel Hobby cron fix)

## Symptom

Deployment failed on Vercel Hobby. `vercel.json` declared:

```json
"crons": [{ "path": "/api/cron/eagletrack-sync", "schedule": "* * * * *" }]
```

Vercel Hobby rejects any cron schedule more frequent than once daily, so
this cron entry (added in `CHANGELOG-eagletrack-auto-sync.md` as the
serverless replacement for the BullMQ worker) failed deployment outright.

## Fix

### 1. `vercel.json`

Changed the schedule from `* * * * *` to `0 0 * * *` (once daily) so
deployment succeeds. The route itself (`app/api/cron/eagletrack-sync/route.ts`)
is unchanged in logic — same lock, same per-tenant throttle, same
fail-open policy — only its doc comments were updated to describe its
new role (see below). It is no longer the primary freshness mechanism.

### 2. Read-through refresh (new primary mechanism)

New file: `modules/telematics/services/eagletrack-read-through.service.ts`,
exporting `refreshEagleTrackIfStale(tenantId, config)`.

Wired into the two endpoints the live map actually depends on for
freshness:

- `LiveMapService.getLiveMapData` (`GET /api/telematics/live-map`)
- `LiveMapService.getVehicleDetail` (`GET /api/telematics/live-map/vehicle/[vehicleId]`)

Before assembling the response, each now:

1. Reads the tenant's Eagle Track config (already had `lastSyncAt`,
   `enabled` — no new fields needed on `EagleTrackConfig`).
2. If Eagle Track isn't configured/enabled for the tenant → no-op.
3. If `lastSyncAt` is missing or older than **50s** (inside the
   45–60s window) → triggers `eagletrackAdapter.syncOrganization(tenantId)`
   and **awaits** it before continuing, so the response reflects the
   fresh pull. Otherwise returns immediately with the existing data.
4. If a sync is already in flight for that tenant (another request hit
   the same staleness window), the second caller does **not** trigger a
   second sync — it just reads what's there.

This piggybacks on the live map frontend's existing ~10s poll
(`useLiveMap`, `useVehicleDetail`) instead of adding a separate
scheduler: most polls land inside the 50s window and are a plain read;
roughly one poll per tenant per ~50s does the trigger-then-read.

### 3. Redis lock / throttle (task 3)

`refreshEagleTrackIfStale` takes a short Redis lock
(`SET readthrough:eagletrack-sync:<tenantId> NX PX 25000`) before
calling `syncOrganization`, released in a `finally` via the same
compare-and-delete Lua pattern `app/api/cron/eagletrack-sync/route.ts`
already used. This is what stops N concurrent map viewers, or the
live-map and vehicle-detail polls landing in the same tick, from each
triggering their own Eagle Track sync — only the request that wins the
lock syncs; the rest read the existing data.

### 4. Fail-open when Redis is unavailable (task 4)

If the Redis `SET NX` call throws (`REDIS_URL` absent, or the
connection is down — same "optional platform-wide" contract
`infrastructure/queue/queue.service.ts` already documents), the lock
step logs a warning and **does not block the sync**: it still triggers
`syncOrganization` directly. A small in-process `Map` collapses
concurrent requests hitting the *same warm serverless instance* in this
fallback path only; across instances/processes, correctness against
duplicate telemetry points falls back to the adapter's own guard —
`eagletrack.adapter.ts`'s `ingestStatus` already refuses to re-append a
fix it has already stored, which is exactly the "existing staleness
guard" the task asks this to rely on.

### 5. Manual sync route — unchanged (task 5)

`app/api/telematics/eagletrack/sync/route.ts` and
`EagleTrackController.syncNow` are untouched. They don't go through
`eagletrack-read-through.service.ts` at all and still sync immediately
on every call, regardless of staleness.

### 6. Everything else — unchanged (task 6)

No changes to: token query-string auth, `user=<username>` selector,
vehicle matching, the ingestion staleness guard, Cartrack, or
multi-tenancy. `eagletrackAdapter.syncOrganization` is called exactly as
it already was by the manual route, the BullMQ worker branch, and the
(now-daily) cron — the read-through refresh is a fourth caller of the
same method, not a new sync implementation.

### 7. "Last sync" indicator (task 7)

`LiveMapPayload` gained two optional fields:

```ts
eagletrackLastSyncAt?: string | null;
eagletrackLastSyncStatus?: 'success' | 'error';
```

populated from the (possibly just-refreshed) Eagle Track config in
`getLiveMapData`. `frontend/modules/telematics/pages/LiveMapPage.tsx`
renders it as a small badge next to the existing "Showing simulated demo
positions" badge — `"Eagle Track synced 12 seconds ago"`, in the
destructive badge style when the last sync recorded an error — and is
simply not shown for tenants without Eagle Track configured/enabled.

## Files changed

- `vercel.json` — cron schedule `* * * * *` → `0 0 * * *`
- `app/api/cron/eagletrack-sync/route.ts` — doc comments only; logic
  unchanged
- `modules/telematics/services/eagletrack-read-through.service.ts` — new
- `modules/telematics/services/live-map.service.ts` — wires the
  read-through refresh into `getLiveMapData` and `getVehicleDetail`;
  `getLiveMapData` now also returns `eagletrackLastSyncAt` /
  `eagletrackLastSyncStatus`
- `modules/telematics/types/live-map.types.ts` — adds those two optional
  fields to `LiveMapPayload`
- `frontend/modules/telematics/types/index.ts` — comment only (re-exports
  `LiveMapPayload` unchanged)
- `frontend/modules/telematics/pages/LiveMapPage.tsx` — "Last sync"
  badge

## Not changed

- `workers/telemetry.worker.ts`, `server/scheduler/bootstrap-schedules.ts`
  — still correct for a deployment that runs a dedicated worker process
  (`docker-compose.yml`'s `worker` service); pinned by
  `tests/unit/telematics/eagletrack-worker-wiring.spec.ts`.
- `modules/telematics/adapters/eagletrack/*` — no changes; every fix
  from prior changelogs (token query-string auth, `user=<username>`
  selector, vehicle matching, staleness guard) is untouched.
- `modules/telematics/adapters/cartrack/*` — untouched.
- Multi-tenancy / org-unit scoping — untouched; both endpoints still
  resolve `tenantId` from `TenantContext.organizationId` via
  `resolveTenantContext`, exactly as before.
