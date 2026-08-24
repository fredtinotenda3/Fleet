# Fleet Operating Intelligence Platform — Evidence-Based Architecture Audit

**Archive audited:** `Fleet-main.zip`
**Date:** 22 August 2026
**Scope:** Fresh audit of the current repository state. No files modified, no code written, no ZIP produced.

## Verified baseline

| Metric | Value | How verified |
|---|---|---|
| TS/TSX files | 2,057 | `find` |
| Lines of TS/TSX | 167,520 | `wc -l` |
| API route files | 303 | `find app/api -name route.ts` |
| Pages | 63 | `find app -name page.tsx` |
| Backend modules | 37 | `ls modules/` |
| Test suites | 50 (40 security, 10 unit) | `find tests` |
| `tsc --noEmit` | **0 errors** | executed in an isolated copy |
| `npx jest --ci` | **767 passed / 767, 50 suites** | executed in an isolated copy |
| `npm ci` | **FAILS** | `npm ci --dry-run` |
| Next.js / React / TS | 15.3.9 / 19.0.0 / 5.8.3 | `package.json` |
| `engines` field | **absent** | `package.json` |

Verification was performed on a copy at `/home/claude/verify`; the uploaded tree was read-only throughout.

---

# 1. Executive architecture assessment

## What the repository actually implements

**Application architecture.** Next.js 15 App Router monolith. `app/api/**/route.ts` files are thin shims that delegate to `modules/<domain>/controllers/*.controller.ts`. Controllers call services; services call repositories; repositories extend `server/repositories/base.repository.ts`, which wraps the raw MongoDB driver. There is no ODM. Frontend lives in `frontend/modules/**` and `frontend/shared/**`, separate from the backend `modules/**` tree of the same name — a naming collision that is navigable but consistently confusing.

**Domain architecture.** 37 backend modules, each with the same internal shape (`controllers/`, `services/`, `repositories/`, `types/`, sometimes `commands/`, `events/`, `export/`). Boundaries are real at the directory level and mostly real at the import level. Cross-module imports do occur (the attention ownership resolver imports from `vehicles`, `drivers`, `expenses`) but they go through repository/service public entry points rather than reaching into internals.

**Repository/service pattern.** `BaseRepository<T extends BaseEntity>` provides `findById`, `findOne`, `findMany`, `create`, `update`, `softDelete`, `hardDelete`, plus tenant-scope enforcement via `getTenantFilter()` → `resolveTenantScope()`. `server/repositories/tenant-scoped.repository.ts` adds the `OrgUnitScopedEntity` layer. This is the strongest structural element in the codebase.

**Event architecture.** A full CQRS + domain-event layer exists and **is wired**: `instrumentation.ts` → `bootstrapCqrs()` (`server/cqrs/cqrs.module.ts:15`) → `bootstrapEvents()` (`server/events/bootstrap.ts:26`). Five middleware (logging, metrics, audit, retry, validation), an `EventRegistry`, domain publishers, and 14+ handler families including `WorkflowTriggerHandler`, `IntelligenceHandler`, `AIPredictionTriggerHandler`, `DigitalTwinProjectionHandler`. **However the bus is `InMemoryEventBus`, unconditionally** — see §13.

**Background processing.** 13 BullMQ workers under `workers/`, started by `workers/bootstrap.ts`, which **no-ops entirely when `REDIS_URL` is unset** and is intended for a dedicated process (`scripts/worker.js`, `docker-compose.yml`). The deployment target is Vercel (`vercel.json`), which has no long-lived process — so in the production topology the workers do not run at all. The EagleTrack read-through service documents this explicitly and works around it by doing sync work inline on the read path.

**Caching.** Three layers exist (`infrastructure/cache/cache.service.ts`, `query-cache.service.ts`, and a permission cache in `modules/security`). The query cache is **effectively dead**: repo-wide grep finds invalidation calls in `AnalyticsHandler` and exactly **one** population call, in `workers/analytics-refresh.worker.ts:42` — a worker that does not run on Vercel. Nothing on a read path calls `getOrFetch`. So the cache is invalidated constantly and read never.

**Database architecture.** MongoDB, ~60 `tbl*` collections, soft deletes via `isDeleted`, indexes declared centrally in `infrastructure/database/indexes.ts` plus seven addendum files, applied by `npm run db:indexes`. Index coverage is good for core collections and **absent for six telematics collections** (§11).

**API architecture.** 303 routes. Versioning exists (`/api/v1`, `/api/v2` rewritten by middleware). Auth is applied **per route** via `withAuth()` / `withSession()` wrappers, not by middleware — see §18, finding S-1.

**Auth/authz.** Dual system: NextAuth session **and** a custom access-token cookie, unified behind `server/auth/auth-context.ts::getAuthContext()`. `server/permissions/roles.ts` provides `Permission` enum + `PermissionService`. `server/tenancy/tenant-scope.ts` is a single fail-closed tenant resolver; `TenantContext.accessibleOrgUnitIds` carries the org-unit closure.

**Telemetry architecture.** Two adapters (`cartrack`, `eagletrack`) under `modules/telematics/adapters/`, both writing through `telematicsService.ingestTelematicsData()` into `tbltelematics`. There is **no provider interface**, no registry, no capability model — see §5.

**AI/intelligence architecture.** `modules/ai` (7 services: fleet-health, driver-risk, fuel-fraud, expense-anomaly, predictive-maintenance, needs-attention, base) and `modules/intelligence` (anomaly detection). Outputs are computed on read, some persisted to `tblattentionitems` / `tblanomalies`. See §15.

## Does the intended pipeline hold?

The target chain is:

```
Provider → Provider Adapter → Normalized Telemetry Contract → Fleet Domain
        → Analytics/Intelligence → Attention/Opportunity → Actions/Workflows
```

**Verdict: the chain holds structurally from "Fleet Domain" rightwards, and breaks at both ends.**

- **Provider → Adapter → Contract: BROKEN.** There is no contract, only a persistence type that adapters populate inconsistently. `TelematicsData` has no `provider` field; provider identity is encoded as a *string prefix on `deviceId`* (`cartrack-`, `eagletrack-`, `demo-`) and decoded by `live-map.service.ts:73 providerSourceFor()` with `return 'cartrack'` as the **default fallback** — so any future provider is silently labelled Cartrack until someone edits that function.
- **Contract → Fleet Domain: HOLDS.** Both adapters route through `telematicsService.ingestTelematicsData`, so alerting, geofencing and notification logic is not duplicated. This is genuinely well done.
- **Domain → Analytics → Attention: HOLDS.** `needs-attention.service.ts` aggregates seven sources into `AttentionItem`, persisted with idempotent upsert on `{tenantId, itemKey}` and now with true ownership resolution.
- **Attention → Actions: BROKEN.** `attention-resolution.service.ts` writes a `ValueLedgerEntry` on resolve, but nothing dispatches an operational action. No attention item creates a work order, a purchase request, or a workflow instance. Intelligence is **analytics-plus-a-ledger**, not a closed loop.

**Provider-specific leakage into domain code — confirmed instances:**

| Location | Leak |
|---|---|
| `live-map.service.ts:73` | `providerSourceFor()` hardcodes three provider prefixes; defaults unknown providers to `'cartrack'` |
| `live-map.service.ts:381` | `getVehicleDetail` directly calls `eagletrackConfigRepository` and `refreshEagleTrackIfStale` — a generic map read that names one vendor |
| `live-map.types.ts` | `LiveMapDataSource` is a closed union of `'cartrack' \| 'eagletrack' \| 'demo'` |
| `telematics.types.ts` | `TelematicsAlert.providerAlertKey/providerTriggerId/providerTypeCode/providerTypeLabel` — vendor reconciliation fields on the canonical alert type |
| `app/api/telematics/**` | Separate `cartrack/` and `eagletrack/` route trees with vendor-named endpoints |

**Is the platform genuinely modular?** Mostly yes at the domain layer, mostly no at the telematics layer. Adding a third provider today requires editing `providerSourceFor`, the `LiveMapDataSource` union, `live-map.service.ts`'s refresh block, the module-scope registry, the index addendum, and creating a parallel route tree — none of which is "provider adapter" work.

---

# 2. Platform strengths (with evidence)

**S1 — Fail-closed tenant scope with the failure mode documented in place.**
`server/repositories/base.repository.ts:71-101`. `getTenantFilter()` delegates to `resolveTenantScope()`; the legacy fail-open sentinels (`'default'`, `'system'`, `'super_admin'`) now raise `TenantScopeError` instead of returning `{}`. The original broken code is preserved in the comment above the fix. `isSuperAdmin` was split into `canBypassRbac` vs `isPlatformAdmin` so an organization owner can bypass RBAC without gaining cross-tenant reads.

**S2 — Filter-spread order is treated as load-bearing and is documented as such.**
`base.repository.ts:240` and `report-query.engine.ts:113-119` both spread the scope predicate **last**, with comments explaining that `orgUnitId` is a user-filterable field and spreading scope first would let a caller overwrite it. Two independent code paths, same discipline, same reasoning.

**S3 — `normalizeDoc()` closes the `_id` type lie at its source.**
`base.repository.ts:190`. Converts top-level `ObjectId` → hex string on read; `toObjectId()` provided for the write side; scope deliberately limited to top-level `_id` with the rationale (nested reference fields are already strings; a deep walk would rewrite caller payloads). The two production incidents it closes are named inline: `expandWithDescendants()`'s mixed string/ObjectId `$in`, and `moveUnit()`'s `{path: unit._id}` matching nothing.

**S4 — Tenancy policy is reviewable data, and CI enforces it.**
`server/tenancy/module-scope.registry.ts` (605 lines, 37 modules) records each module's scope level, collections, rationale, and a `confirmed` flag. `tests/security/module-scope-conformance.spec.ts` reads the registry and fails when a module declared `org-unit` lacks its addendum or repository wiring. This converts "someone forgot to scope the new endpoint" — the recurring failure class in this codebase — from invisible to a red build. **This is the single best architectural decision in the repository.**

**S5 — Export paths are scoped, and that too is enforced structurally.**
`tests/security/export-scope-conformance.spec.ts` pins all five export paths (expenses, fuel, maintenance, trips, vehicles) to their scoped repository methods. `EXPORT_ROW_CAP = 50_000` with a `truncated` flag and `X-Export-Truncated` header (`shared/export/export.constants.ts`) — no unbounded synchronous Mongo query, and the cap's future removal path (background jobs) is documented rather than assumed permanent.

**S6 — Attention-item ownership is now resolved from the target entity.**
`modules/attention/services/attention-ownership.resolver.ts` (216 lines). Per-source `AttentionOwnerTarget` → tenant-scoped lookup → the entity's *own* `orgUnitId`. Fail-closed on every branch (no target, missing id, cross-tenant id, unbackfilled row, lookup throws → `null` → invisible to scoped reads). Centralised deliberately rather than duplicated into five AI services. **The item my previous audit called the true Phase 0 has been done properly.**

**S7 — Secrets at rest use AES-256-GCM with a versioned envelope and a production fail-closed.**
`infrastructure/secrets/encryption.service.ts`. `v1:<iv>:<tag>:<ciphertext>`, 12-byte IV, auth tag verified. `SECRETS_ENCRYPTION_KEY` missing **throws** when `NODE_ENV === 'production'`, warns and uses a dev key otherwise. Provider tokens are encrypted at rest and decrypted only inside `buildClient()`; `EagleTrackConfigResolved` is documented as never persisted.

**S8 — EagleTrack's staleness guard compares provider clock to provider clock.**
`eagletrack.adapter.ts::ingestStatus` compares `mapped.timestamp` against `existingDevice.lastFixAt` (the provider's own last fix), never against `lastPingAt` (server wall clock). `telematics.types.ts:14-45` documents both fields and the incident that motivated the split. Four ordered cases including the equal-timestamp branch that ingests only if the fix signature actually changed. This is careful, correct work.

**S9 — Historical ingest is idempotent and deliberately bypasses the live pipeline.**
`telematics.repository.ts:654 bulkUpsertHistoricalReadings` — in-batch dedupe by `vehicleId|deviceId|timestamp`, then `$setOnInsert` upsert on `{tenantId, vehicleId, deviceId, timestamp}`. `eagletrack-history.service.ts` routes around `ingestTelematicsData` so replaying a month does not re-fire geofences, re-raise alerts, or notify managers. The reasoning is documented at the top of the file. *(Weakened by the missing unique index — see F-3.)*

**S10 — Absent-vs-zero is a first-class type-level concern.**
`telematics.types.ts` makes every `engine`/`trip`/`fuel` member optional with doc comments naming the consequence of each fabricated zero: `fuelLevel: 0` manufactures a low-fuel alert on every poll; `odometer: 0` wins the digital-twin fallback chain; `heading: 0` points every non-reporting arrow due north. *(The type is right; one adapter still ignores it — see F-2.)*

---

# 3. Critical weaknesses / findings

## CRITICAL

### F-1 · Fail-open `CRON_SECRET` on five mutating, unauthenticated GET endpoints

**Location:** `app/api/security/expire-grants/route.ts:21`, `app/api/reminders/update-status/route.ts:18`, `app/api/reminders/notify-overdue/route.ts:20`, `app/api/cron/eagletrack-sync/route.ts:131`, `app/api/workflows/process-timeouts/route.ts:25`

**Evidence:** every one is the identical pattern:
```ts
const CRON_SECRET = process.env.CRON_SECRET;
if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return 401;
```
When `CRON_SECRET` is unset the guard is skipped entirely. There is no route wrapper, and `middleware.ts`'s matcher excludes `/api/` (see S-1), so nothing else protects them.

**Impact, per route:**
- `expire-grants` — soft-deletes `ResourcePermission` grants, then calls `permissionCacheService.invalidateAll()`. A global permission-cache flush available to any unauthenticated caller, repeatable in a loop: a denial-of-service with an authorization side effect.
- `process-timeouts` — enumerates **every active tenantId** from `tblorganizations`, runs escalations for each, and **returns the tenant list in the `perTenant` response body**. Unauthenticated cross-tenant enumeration plus unauthenticated workflow escalation across every tenant on the platform.
- `update-status` — `bulkUpdateOverdue('system')` across all reminders. The file's own header says it "previously had NO authentication at all"; the replacement is fail-open.
- `cron/eagletrack-sync` — triggers vendor API traffic on demand; an attacker can burn the customer's vendor rate limit.

**Why it matters:** these are the deepest-privileged operations in the product (cross-tenant, authorization-mutating) sitting behind the weakest possible guard, on `GET`, which means a browser preload, a crawler, or a `<img src>` reaches them.

**Direction:** fail closed — refuse to serve when the secret is unset; move to `POST`; use timing-safe comparison; prefer a route wrapper so the check cannot be forgotten by the next route.

### F-2 · Cartrack adapter fabricates measurements the type system now forbids

**Location:** `modules/telematics/adapters/cartrack/cartrack.adapter.ts:128-152`

**Evidence:**
```ts
engine: { rpm: 0, coolantTemp: 0, fuelLevel: status.fuel_level_percent ?? 0,
          throttlePosition: 0, engineLoad: 0 },
trip:   { odometer: status.odometer_km ?? 0, tripDistance: 0, tripDuration: 0,
          averageSpeed: status.position.speed, maxSpeed: status.position.speed,
          idleTime: ... },
fuel:   { consumptionRate: 0, instantConsumption: 0, fuelUsed: 0 },
location: { ..., altitude: status.position.altitude ?? 0, accuracy: 0 }
```

`telematics.types.ts` was widened to make all of these optional **precisely to stop this**, and the EagleTrack adapter was updated to use the widening. Cartrack was not.

**Impact:**
1. `fuelLevel: 0` satisfies `checkForAlerts`' `< 10` branch → a **high-severity "Low fuel level" alert plus a fleet-manager notification on every poll, for every Cartrack vehicle that does not report fuel**. Alert fatigue that trains operators to ignore the alert channel.
2. `odometer: 0` wins `digital-twin.service.ts`'s `latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0` chain — telemetry overwrites the vehicle's real recorded odometer with a placeholder.
3. `averageSpeed`/`maxSpeed` are set to the **instantaneous** speed. Cartrack's status payload has no trip aggregation; these are two invented statistics presented as measurements.
4. Once the finance module posts telemetry-driven costs, a zero odometer produces a null or infinite cost-per-km.

**Why it matters:** the two providers now disagree about what "no data" means, in the same collection, read by the same UI. This is the concrete cost of having no provider contract.

### F-3 · No unique index backs the telemetry idempotency key

**Location:** `infrastructure/database/indexes.telematics-addendum.ts`

**Evidence:** `tbltelematics` has two indexes, both **non-unique**: `{tenantId, vehicleId, timestamp:-1}` and `{tenantId, deviceId, timestamp:-1}`. `bulkUpsertHistoricalReadings` upserts on the 4-tuple `{tenantId, vehicleId, deviceId, timestamp}` — a key with **no index at all**, let alone a unique one.

**Impact:** MongoDB's upsert is only atomic against a unique index. Two concurrent history backfills for the same window — two operators, or a retry overlapping its original — can both miss on the filter and both insert. The in-batch `Set` dedupe protects within one call and not across calls. The filter is also unindexed, so every upsert is a collection scan within the tenant.

Six telematics collections have **no index definitions whatsoever**: `tbltelematics_eagletrack_links`, `tbltelematics_eagletrack_triggers`, `tbltelematics_eagletrack_config`, `tbltelematics_cartrack_config`, `tbltelematics_demo_state`, `tblgeocode_cache`. The link table in particular is queried on every sync via `mapByUin(tenantId)` and needs a unique `{tenantId, uin}` — without it, two links for one tracker are storable and `Map` construction silently keeps the last one.

`tblgeocode_cache` has **no TTL index** — unbounded growth on a cache.

`tbltelematics_geofence_states` has a unique index on `{vehicleId, geofenceId}` with **no `tenantId` prefix** — safe today only because both are globally-unique ObjectIds, which is an accident rather than a design.

### F-4 · Workflow approval has neither RBAC nor assignee enforcement

**Location:** `modules/workflows/services/workflow-engine.service.ts:333`, `app/api/workflows/**`, `server/permissions/roles.workflow-addendum.ts`

**Evidence:**
```ts
private isAuthorizedForStep(step, stepInstance, userId, workflow): boolean {
  if (step.assignee && step.assignee.length > 0) { ...return isAssignee; }
  // Role-based assignment without an explicit assignee list is permitted
  // through (role resolution ... happens at the API layer / permission
  // middleware, not inside the engine).
  return true;
}
```
The API layer it defers to does not exist. All workflow routes use `withSession()` — authenticated only, **no permission**. `server/permissions/roles.workflow-addendum.ts` is a **comment file**: `WORKFLOW_VIEW/MANAGE/START/APPROVE` were never added to the `Permission` enum, and grep confirms nothing imports it.

**Impact:** any authenticated user in a tenant — including a driver — can approve or reject any role-assigned workflow step, and can create or delete workflow definitions. Where workflows gate spend or compliance sign-off, this is unbounded privilege escalation inside the tenant.

**Note:** the addendum file itself names this exact gap, including the subtlety that holding `WORKFLOW_APPROVE` still would not answer "is this the right person for *this* step". It has simply never been actioned.

### F-5 · `POST /api/telematics/ingest` is authenticated but unauthorized and unscoped

**Location:** `modules/telematics/controllers/telematics.controller.ts:23`

**Evidence:** resolves `tenantId` via `getTenantFromRequest` (so 401 is enforced), validates the body with Zod, then calls `ingestTelematicsData({...parsed.data, tenantId})`. There is **no permission check, no check that `vehicleId` belongs to the caller's org unit, and no `orgUnitId` on the written row**.

**Impact:** any authenticated user can post arbitrary telemetry against any `vehicleId` in the tenant — fabricating position, speed, odometer and fuel level. That corrupts the digital twin, fires geofence and speeding alerts, writes a false GPS trace into a vehicle's history, and — once finance posts telemetry-driven costs — corrupts the ledger. Writing with no `orgUnitId` also makes the row invisible to every scoped reader, so the corruption is *harder* to see than legitimate data.

## HIGH

### F-6 · A live production vendor API token is committed to the repository

**Location:** `manual-eagletrack-trigger-sync.md:10`, `tests/security/telematics-eagletrack-token-leak.spec.ts:50`, and three CHANGELOG files.

**Evidence:** the EagleTrack production token appears in plaintext in five tracked files, alongside the production domain and account name. Three of those files are changelogs stating the token needs rotating.

**Impact:** with EagleTrack's query-parameter auth, this token grants full read access to the customer's live fleet telemetry — positions, routes, drivers, fuel. It is in the repository, in any clone, and in the vendor's access logs.

**Why it matters:** this has been flagged across at least three prior work rounds and remains unrotated **and now also committed**. Rotation alone is insufficient — the value must be purged from the files, and the test fixture should use a synthetic token.

`SECURITY-CREDENTIALS.md` separately documents four other credentials (MongoDB Atlas user, `NEXTAUTH_SECRET`, `JWT_SECRET`, third-party keys) as compromised and unrotated. `.gitignore` correctly excludes `.env*` and no `.env` file is present in the archive.

### F-7 · Real-time channel is tenant-scoped but not org-unit-scoped

**Location:** `infrastructure/websocket/server.ts:69`, `modules/telematics/services/telematics.service.ts:30`

**Evidence:** sockets join exactly one room, `tenant:${tenantId}`. `ingestTelematicsData` calls `emitToTenant(data.tenantId, 'vehicle:location', {vehicleId, location, timestamp})` for **every** ingested fix.

**Impact:** every user in a tenant receives live positions for every vehicle in that tenant, regardless of org unit. The REST live-map path is correctly org-unit scoped (`live-map.service.ts`, `assertVehicleInScope`), so the same data is denied over HTTP and pushed over WebSocket. A Bulawayo branch user receives Harare vehicle movements in real time. This is a genuine org-unit isolation leak, and it is the *only* place I found where a scoped read has an unscoped realtime counterpart.

**Secondary:** `socket.on('subscribe')` lets a client join arbitrary `event:${name}` rooms with no validation. Nothing currently emits to `event:` rooms, so it is inert today — but it is an unvalidated client-controlled room join sitting in the handshake path.

### F-8 · Rate limiting is in-memory and per-instance

**Location:** `infrastructure/security/rate-limit.ts:6`

**Evidence:** `const requestStore = new Map<string, number[]>()`, with the comment `// In-memory store (replace with Redis in production)`. Default 100 requests / 60s, applied by default to every `withAuth` route.

**Impact:** on the documented serverless deployment target, each instance holds its own map and every cold start resets it. The effective limit is `100 × instance count` and unpredictable. Login brute-force is separately mitigated by `tblaccountlockouts` / `tblloginattempts`, so this is a resource-abuse control rather than a credential control — but it does not do what it claims.

`getIpAddress()` takes the first value of `x-forwarded-for` unconditionally. Behind Vercel that header is overwritten and safe; behind any proxy that appends rather than replaces, the key is client-controlled and the limit is trivially bypassed.

### F-9 · Query cache is invalidate-only — a permanent miss

**Location:** `infrastructure/cache/query-cache.service.ts`, `server/events/handlers/analytics/AnalyticsHandler.ts`

**Evidence:** `AnalyticsHandler` issues 10+ `invalidatePattern` calls across vehicle/expense/fuel/maintenance events. Grep for `getOrFetch` outside the cache module finds exactly **one** caller: `workers/analytics-refresh.worker.ts:42` — a worker that does not run on Vercel. **No read path populates or reads the cache.**

**Impact:** every dashboard aggregation is computed live on every request, and the system pays event-handler and Redis round-trip cost to invalidate entries that never exist. The performance layer is a net cost.

**Also:** cache keys are `dashboard:${tenantId}:kpis`, `vehicle:${tenantId}:${vehicleId}:analytics` — **tenant-keyed, never org-unit-keyed**. If the cache is ever wired to a read path as written, a branch manager's request would populate a tenant-wide key and serve it to every other branch. This is a latent cross-org-unit leak that only stays latent because the cache is dead.

### F-10 · Multi-currency exists as type declarations with no implementation

**Location:** `modules/finance/types/finance-currency.addendum.ts`

**Evidence:** the file declares module augmentations adding `currency`, `fx_rate`, `fx_rate_date`, `fx_source`, `reporting_amount` to `Expense`, `FuelLog` and `Reminder`. Grep for `fx_rate` or `reporting_amount` anywhere outside `modules/finance/types/` returns **nothing** — no writer sets them, no reader consumes them.

**Impact:** the allocation ledger stores `currency` + `fxRate` + a reporting-currency amount per posting and refuses to total across mixed currencies. But the transactions it draws from carry no currency at all, so every posting is implicitly the reporting currency. A tenant operating across a border (the tenant names in this deployment are Zimbabwean; USD/ZWL dual pricing is the norm there) will produce cost-per-km figures that silently mix currencies. The type augmentation makes the fields *appear* available to any future author.

### F-11 · The transactional outbox is complete, correct, and dead

See §13. `OutboxEvent`, `OutboxRepository`, `OutboxPublisher` (implements `IEventPublisher`), `OutboxProcessor` all exist. The **only** consumer anywhere in the repository is `workers/cleanup.worker.ts:64`, which purges `{processed: true}` rows from a collection nothing writes to. `EventBusFactory.getInstance()` returns `new InMemoryEventBus()` with no environment branch and no alternative path.

**Impact:** event delivery is in-process, best-effort, and lost on crash or redeploy. Any handler side effect (notification, workflow trigger, AI prediction, digital-twin projection, audit record) can be dropped silently. Nothing is replayable and nothing is auditable at the delivery level.

### F-12 · Telemetry has no retention policy

**Location:** `workers/cleanup.worker.ts`

**Evidence:** four cleanup jobs exist — `cleanup-sessions`, `cleanup-notifications`, `cleanup-outbox`, `expire-resource-grants`. **None touches `tbltelematics`.** No TTL index is declared on it.

**Impact:** at a ~50-second poll cadence, one vehicle produces roughly 1,700 rows/day, 620k/year. At 1,000 vehicles that is ~620M documents per year in a collection with two non-unique compound indexes, growing without bound. This is the clearest single scaling cliff in the system.

### F-13 · Geofence evaluation runs per ping with an unbounded per-vehicle query

**Location:** `modules/telematics/services/telematics.service.ts:37, 188`

**Evidence:** `ingestTelematicsData` calls `checkGeofence` on every location fix. `checkGeofence` issues `getActiveGeofences(vehicleId, tenantId)` then `getGeofenceStatesForVehicle(...)`, then loops with `await` inside for alerts — sequential, one round trip per triggered alert.

**Impact:** 2 queries minimum per ping, plus sequential alert writes. At 1,000 vehicles on a 50-second cadence that is ~2,400 geofence queries/minute before any alert fires, on a collection indexed `{tenantId, vehicleId}` but not by geometry. Additionally `ingestTelematicsData` enqueues a `REFRESH_ANALYTICS` job **per ping** — on a Redis-less deployment that call path is a no-op, and on a Redis-enabled one it is a job per vehicle per poll.

## MEDIUM

### F-14 · Two overlapping action engines, both organization-scoped

`modules/rules` (`RuleEngineService`, `RuleActionRegistry`, 14-operator condition trees, 5 default actions including `start_workflow`) and `modules/workflows` (`WorkflowEngine`: start/approve/reject/cancel/processTimeouts + escalation). 2,039 LOC combined. Both are registered `level: 'organization'` in the module-scope registry, and **every `WorkflowEngine` method takes `tenantId: string`, never a `TenantContext`** — so no workflow or rule action is org-unit scoped. A branch manager's approval and a different branch's approval are indistinguishable to the engine. Details and recommendation in §14.

### F-15 · Provider clients have timeouts but no retry, no backoff, no rate limiting, no circuit breaker

Both clients set a 15s `AbortController` timeout (`cartrack-api.client.ts:90`, `eagletrack-api.client.ts:535`). EagleTrack has one narrow retry — cycling `dateRange` encodings, and **only** on an explicit vendor error envelope, deliberately never on timeout/DNS/5xx (documented at `eagletrack-api.client.ts:387-398`, and that restraint is correct). But there is:
- no retry with backoff on transient vendor failure anywhere
- no client-side rate limiting toward either vendor
- no circuit breaker — a vendor outage means every read-through-triggered map load pays the full 15s timeout
- no failover and no provider health surface

### F-16 · Read-through refresh fails open across instances

`eagletrack-read-through.service.ts`. Redis `SET NX PX` lock, TTL 25s, staleness window 50s. When Redis is unavailable the code falls open to an in-process `Map`, documented as relying on "the adapter's own staleness guard" as backstop. That backstop is real but per-device and post-hoc: concurrent syncs across instances still both call the vendor. On Vercel, where Redis is optional and instances are many, the common case is *N* concurrent vendor calls per staleness window.

Structurally: **the read path performs writes.** A `GET` on the live map can trigger a full roster fetch, a fleet status fetch, driver and trigger sub-syncs, device registration, and N telemetry inserts. p99 latency on the map is bounded by vendor latency, and any load spike on the map is amplified into vendor load.

### F-17 · Live map is a poll, not real-time

`useLiveMap.ts` polls the Fleet API every ~10s; the API optionally triggers a vendor sync every ~50s; the vendor's `/api2/last` returns the last known fix. So worst-case position age is roughly poll + staleness + device reporting interval. The WebSocket channel exists and emits `vehicle:location`, but the map's data path is the REST poll. The UI presents this as live. This is the clearest instance of your §9 concern: **the capability looks real-time and is periodic refresh.**

### F-18 · `Math.random()` in a driver-safety severity classification

`modules/ai/services/driver-risk.service.ts:465`:
```ts
severity: Math.random() > 0.7 ? 'High' : 'Medium',
```
inside `collectIncidents`, for every speeding incident. Most of the fabricated-data issues in this module were fixed and documented (`generateRiskTrends` at :375, `expense-anomaly` at :168/:256, `fleet-health` at :265). **This one survived.** A driver's incident severity — the input to a risk score that could inform employment decisions — is a coin flip. Not reproducible: the same query returns different severities on each call.

### F-19 · CI cannot run

`.github/workflows/ci.yml` runs `npm ci`, which fails (§21). Even if it passed, the pipeline runs `test:unit` (security + unit), `test:integration` (`--passWithNoTests`), `test:e2e` (`echo "no e2e suite yet"; exit 0`) and `test:performance` (same stub). Three of five test steps are unconditional passes. `npm run lint` runs `next lint`, which is removed in Next 15 in favour of the ESLint CLI. `next.config.ts` sets `ignoreDuringBuilds: true` for ESLint, so lint failures never block a build either.

### F-20 · Nightly backup loads the entire database into a JS array

`workers/backup.worker.ts:30-38`: iterates every collection, pushes `JSON.stringify(doc)` into a `string[]`, then `lines.join('\n')` and gzips. Peak memory is roughly 2–3× the full logical database size, in one process, held as a single string. At the telemetry volumes in F-12 this OOMs long before it becomes a useful DR artifact. (It also does not run at all on Vercel.)

### F-21 · Config-conflicted cron schedule

`vercel.json` schedules `/api/cron/eagletrack-sync` at `0 0 * * *` — **once daily**. The read-through service's header explains this: Vercel Hobby rejects per-minute schedules. So the daily cron is vestigial and freshness depends entirely on someone having the map open. A fleet nobody is watching has no telemetry ingested at all. That is a defensible workaround for a hobby plan and an unacceptable property for an enterprise product — and it is not documented anywhere an operator would see it.

## LOW

- **F-22** — Stray artifact files committed at repo root: `console.log(JSON.stringify(d`, `r.json())` (both 0 bytes), a directory literally named `npx tsx scripts`, `components.json.backup`, `prompt`, `samples.ts`, `testConnection.ts`, `diagnose-login.ts`. Shell-paste accidents.
- **F-23** — `next/font/google` (`app/layout.tsx:3`) fetches Geist at build time; breaks air-gapped or network-restricted CI.
- **F-24** — No `engines` field in `package.json`; CI pins Node 20 but nothing enforces it locally.
- **F-25** — No error-monitoring backend. `@sentry/nextjs` was removed; `infrastructure/monitoring/sentry.ts` is a documented no-op shim. OTel is wired but exports only where a collector is configured.
- **F-26** — `providerSourceFor()` defaults unknown device prefixes to `'cartrack'` rather than `'unknown'`.
- **F-27** — Demo-mode telemetry is persisted into the real `tbltelematics` collection with a `demo-` device prefix. Gated per-tenant via `tbltelematics_demo_state` and throttled, and the reasoning is documented — but simulated positions live in the same collection as real ones, and any consumer that does not know about the prefix convention (analytics, cost-per-km, ESG exports) will treat them as real.

---

# 4. Enterprise Fleet ERP gap analysis

| # | Capability | Status | Evidence / note |
|---|---|---|---|
| A | Multi-tenancy/security | **PARTIAL** | Tenant layer strong and fail-closed (S1/S2/S4). Org-unit layer has real gaps: F-5, F-7, F-14 |
| B | Fleet core operations | **EXISTS** | vehicles/drivers/trips/fuel/expenses/maintenance all with scoped repos + exports |
| C | Vehicle management | **EXISTS** | `modules/vehicles`, partial-unique plate index, identity resolver, scoped exports |
| D | Driver management | **PARTIAL** | `modules/drivers` exists; **no `Permission.DRIVER_*`** — gated on `VEHICLE_*` as a documented stopgap |
| E | Telematics | **ARCHITECTURALLY WEAK** | Two adapters, no contract, no registry, no health. §5 |
| F | Trips/routes | **EXISTS** | `modules/trips`, analytics indexes, export columns |
| G | Fuel | **EXISTS** | fuel logs, fuel cards, stations, EagleTrack fuel report parsing |
| H | Maintenance | **EXISTS** | reminders, meter logs, dedicated index script |
| I | Workshop | **PARTIAL** | `modules/workshop` + `tblworkshopbays` indexed; thin |
| J | Work orders | **EXISTS** | `modules/workorders` + frontend completion changelog |
| K | Compliance | **PARTIAL** | records org-unit scoped; rules deliberately org-wide and unwired |
| L | Finance | **PARTIAL** | Ledger/depreciation/GL built and indexed; **nothing auto-posts into it** (§16) |
| M | Expenses | **EXISTS** | scoped, exported, anomaly detection on real data |
| N | Procurement | **EXISTS** | requests/orders indexed; approve/reject scope bug fixed previously |
| O | AI/intelligence | **PARTIAL** | 7 services on real data except F-18; five incompatible confidence shapes |
| P | Attention/Command Centre | **EXISTS** | `AttentionItem` persisted, idempotent, ownership-resolved (S6) |
| Q | Opportunities | **MISSING** | No opportunity model, repository, or surface anywhere |
| R | Automation/rules | **DUPLICATE** | `RuleEngine` + `WorkflowEngine`, both org-level. §14 |
| S | Workflow/approvals | **ARCHITECTURALLY WEAK** | F-4: no RBAC, no assignee enforcement, no org-unit scope |
| T | Reporting | **EXISTS** | 44 files, org-unit predicate spread last, capped, conformance-tested |
| U | ESG | **PARTIAL** | `esg-export.service` + PDF generator + scope test; registered `computed` |
| V | Reliability/events | **ARCHITECTURALLY WEAK** | Full event layer on an in-memory bus. F-11 |
| W | Workers/queues | **PARTIAL** | 13 BullMQ workers that **do not run** on the deployment target |
| X | Transactional outbox | **DUPLICATE / dead** | Complete implementation, zero producers. F-11 |
| Y | Caching | **ARCHITECTURALLY WEAK** | Invalidate-only; tenant-keyed not org-unit-keyed. F-9 |
| Z | Observability | **PARTIAL** | OTel + Prometheus registry + `/api/observability/metrics`; **no telematics or provider metrics** |
| AA | Notifications | **EXISTS** | service + worker + `NotificationCenter` + cleanup job |
| AB | Billing | **PARTIAL** | `modules/billing` + indexes + worker; no evidence of a live payment integration |
| AC | Error monitoring | **MISSING** | F-25 |
| AD | Testing | **PARTIAL** | 767 tests, 50 suites, all green — but almost entirely scope/structure. §20 |
| AE | CI/CD | **ARCHITECTURALLY WEAK** | Cannot run; three of five test steps are stubs. F-19 |
| AF | Backup/recovery | **ARCHITECTURALLY WEAK** | Whole-DB-in-memory dump, does not run on Vercel. F-20 |
| AG | Data retention | **MISSING** | No telemetry retention, no geocode TTL. F-12 |

---

# 5. Telematics architecture audit

**Question: can another provider be added without modifying unrelated fleet intelligence/business logic?**

## Answer: No.

There is no provider abstraction. Repo-wide grep across `modules/telematics`, `server/` and `shared/` for `TelematicsProvider`, `ProviderRegistry`, `interface *Provider` returns **one unrelated hit** (`DriverProviderLink` in the driver sync service).

| Element | Present? | Evidence |
|---|---|---|
| Shared provider interface | **No** | Both adapters are bare classes; neither has `implements` |
| Provider contract / capability model | **No** | Nothing declares what a provider supports |
| Provider registration/discovery | **No** | Adapters are module-level singletons imported by name |
| Provider configuration | **Per-provider** | Two separate collections, two separate repositories, two shapes |
| Provider credentials | **Yes, good** | Both encrypted at rest via the shared `encryptionService` (S7) |
| Telemetry normalization | **Partial** | Shared target type; inconsistent adapter behaviour (F-2) |
| Provider error handling | **Divergent** | EagleTrack has a rich taxonomy (`nonJsonBody`, 3xx classification, vendor-rejection detection); Cartrack has `catch → push message` |
| Retry behaviour | **Almost none** | F-15 |
| Rate limiting toward vendor | **No** | F-15 |
| Health monitoring | **No** | Only `lastSyncStatus`/`lastSyncAt` on the config doc; no metric, no endpoint, no alert |
| Availability / failover | **No** | Single provider per tenant, no fallback |

## Exactly where the coupling is

1. **`live-map.service.ts:73`** — `providerSourceFor()` hardcodes `eagletrack-`/`demo-` prefixes and **defaults everything else to `'cartrack'`**. A third provider is labelled Cartrack until this is edited.
2. **`live-map.service.ts:381-397`** — the generic live-map read directly imports `eagletrackConfigRepository` and `refreshEagleTrackIfStale`. One vendor's refresh strategy is embedded in the shared map read path.
3. **`live-map.types.ts`** — `LiveMapDataSource` is a closed string union. Every new provider is a type change rippling into the frontend.
4. **`telematics.types.ts`** — `TelematicsAlert` carries `providerAlertKey`, `providerTriggerId`, `providerTypeCode`, `providerTypeLabel`; `Geofence` carries `provider` + `providerTriggerId`. Vendor reconciliation concepts on canonical domain types.
5. **`deviceId` string prefixes as provider identity** — `cartrack-${serial}`, `eagletrack-${uin}`. Provider identity is parsed from a string rather than stored as a field. `providerSourceFor` is the parser, and it is the third item on this list for a reason.
6. **Route tree** — `app/api/telematics/cartrack/**` and `app/api/telematics/eagletrack/**` are parallel vendor-named trees. A third provider means a third tree.
7. **`infrastructure/database/indexes.telematics-addendum.ts`** — vendor-specific collections would need vendor-specific index entries (and today do not have them at all).
8. **`module-scope.registry.ts`** — vendor collections are enumerated by name.

**Judgement.** The *ingestion* seam is genuinely good: both adapters converge on `telematicsService.ingestTelematicsData`, which is why alerting and geofencing are not duplicated. Everything *around* that seam — identity, configuration, refresh, display, health, routing — is per-vendor. At 5–20 providers this becomes 5–20 route trees, 5–20 config collections, and a `providerSourceFor` with 20 branches and a wrong default. **The seam to build on already exists; the abstraction around it does not.**

---

# 6. EagleTrack integration audit

| Capability | Status | Evidence |
|---|---|---|
| Authentication | **EXISTS** | Query-param token (`?token=`), correct for this vendor |
| Token management | **EXISTS** | Static token; no refresh flow needed |
| Secure credential storage | **EXISTS** | `tokenEncrypted` via `encryptionService`; `EagleTrackConfigResolved` never persisted |
| Tracker synchronization | **EXISTS** | `getTrackersWithRefData()`, roster required before status poll |
| Vehicle mapping | **EXISTS** | 4-tier precedence: admin link → `plate` → `__platenumber` → `name`, first-**match**-wins, exact tenant-scoped equality only |
| Driver synchronization | **EXISTS** | `eagletrack-driver-sync.service.ts`, gated on `SUB_SYNC_INTERVAL_MS` (15 min) |
| Trigger synchronization | **EXISTS** | `eagletrack-trigger-sync.service.ts`; geofence created only when geometry is readable, else `geofenceSkippedReason` |
| Historical telemetry | **EXISTS** | `eagletrack-history.service.ts`, paginated, idempotent |
| Historical route data | **EXISTS** | Read back from `tbltelematics` through the scoped read, not returned from the ingest |
| Fuel report | **EXISTS** | Columnar `{column, body}` parser with four per-cell outcomes and unit validation |
| Live/last telemetry | **EXISTS** | `getLastForAll(username)` with derived username |
| Alerts | **EXISTS** | `eagletrack-alert-sync.service.ts`, paginated, `providerAlertKey` dedupe |
| Read-through refresh | **EXISTS** | Redis-locked, 50s staleness. Architecturally questionable — F-16 |
| Pagination | **EXISTS** | History `MAX_HISTORY_PAGES` with dual stop condition (vendor `pageCount` **and** short page — both, because neither is reliable alone); alerts `MAX_ALERT_PAGES`. **Fuel report: NOT implemented** — `recCount` ambiguity was deliberately left unresolved pending one curl |
| Incremental synchronization | **PARTIAL** | Live poll is incremental via the staleness guard; history is caller-specified windows |
| Retry handling | **PARTIAL** | Only `dateRange` encoding cycling, only on explicit vendor error envelope. Correctly restrained, but there is no transient-failure retry at all |
| Timeout handling | **EXISTS** | 15s `AbortController`, shorter for credential probes |
| Rate limiting | **MISSING** | None toward the vendor |
| API failure handling | **EXISTS** | Errno-code-only transport messages; `redactToken()`; endpoint-only logging (origin+path, never full URL) |
| Malformed responses | **EXISTS** | Body read as text and parsed manually — because the vendor labels successful JSON as `text/html`. `nonJsonBody` flag + 3xx classification so an invalid token surfaces as bad credentials rather than a platform outage |
| Provider downtime | **PARTIAL** | Recorded to config `lastSyncStatus`; no health surface, no circuit breaker, no alert |
| Duplicate records | **PARTIAL** | Application-level dedupe is correct; **no unique index backs it** (F-3) |
| Idempotency | **PARTIAL** | Same |
| Historical backfill | **PARTIAL** | On-demand per vehicle/window only; no scheduled or bulk backfill |
| Synchronization checkpoints | **PARTIAL** | `lastSyncAt` + `lastDriverSyncAt` on the config doc, and per-device `lastFixAt`. **No per-window history checkpoint** — a truncated backfill (`ingested.truncated`) records that it truncated but not where to resume |
| Last successful sync | **EXISTS** | `recordSyncResult` on every path, success or error |
| Partial sync recovery | **PARTIAL** | Sub-syncs isolated in both directions and wrapped in try/catch so a driver-roster failure cannot cost positions; `shouldRunSubSyncs` fails closed on a config read error. But a mid-history-backfill crash simply leaves the window unfinished with no record of the boundary |
| Data freshness | **EXISTS** | `lastFixAt` vs `lastPingAt` correctly separated and documented |
| Stale telemetry detection | **EXISTS** | Live-map status is a disjunction (no position OR vendor `offline===true` OR age > 60min); `stale` kept as a secondary boolean |
| Provider clock/timezone | **PARTIAL** | The critical rule is enforced — provider time is only ever compared to provider time (S8). Timezone *interpretation* of vendor date strings is NOT CONFIRMED FROM REPOSITORY; I did not trace the parser |

## Identity mapping — is it deterministic and safe?

**Yes, with one honest residual.**

| Field | Handling |
|---|---|
| **UIN** | Primary vendor key. `deviceId = eagletrack-${uin}`. Link table keyed on it. **No unique index** (F-3) |
| **IMEI** | Not used for matching |
| **VIN** | Not used for matching |
| **Plate** | The matching axis. Ordered candidates, exact tenant-scoped equality via `findByLicensePlate`, `trim().toUpperCase()` folding only |
| **Tracker ID** | = UIN |
| **Vehicle ID** | Mongo `_id`, carried from the matched vehicle |
| **Driver ID** | Separate sync; not part of tracker matching |

**Determinism:** yes — no fuzzy matching, no similarity scoring, no plate regex, no substring search. `"PT201B abc long long title name"` does not match a vehicle plated `PT201B`. Unmatched trackers are reported in `unmatchedTrackers` and surfaced on the admin mapping screen, never dropped and never auto-created as vehicles.

**Safety:** the admin link is verified against the vehicle table on every read, so a link to a deleted vehicle falls through rather than ingesting against a dangling id. Org-unit is **carried** from the matched vehicle, not derived — the vehicle is the authority on its own unit. `matchedBy` counters record which axis a fleet is standing on.

**Residual, documented in the code:** if `plate` and `name` hold plates of two *different* vehicles, precedence resolves deterministically to `plate` and nothing flags the conflict. The admin link exists to resolve it, but only once an operator notices.

**One genuinely excellent decision worth naming:** fuel report rows carry no UIN, only a `Name` column. Rather than stamping the requested UIN onto every row — which on a deployment that ignores the UIN filter would write other vehicles' fuel and distance into this one, crossing org units while every scope check passed — `attributeRows()` decides on evidence, and keeps *nothing* when several names are present and none match. That is the correct instinct: refuse rather than guess.

---

# 7. Telemetry data normalization

## Against your proposed canonical contract

| Field | Status |
|---|---|
| `provider` | **MISSING** — inferred from a `deviceId` string prefix, default `'cartrack'` |
| `externalDeviceId` | **PARTIAL** — embedded in `deviceId`; EagleTrack also stores raw `uin` in device metadata |
| `vehicleId` | **EXISTS** — Mongo `_id` |
| `timestamp` | **EXISTS** — provider fix time |
| `receivedAt` | **MISSING** on the reading. `createdAt` approximates it; `lastPingAt` holds it per device |
| `latitude`/`longitude` | **EXISTS** — `location.lat/lng` |
| `speed` | **EXISTS**, but **`location.speed` retains a `0` default** (documented as fail-safe: resolves to idle, never moving) |
| `heading` | **EXISTS, correctly optional** — no `0` fallback, because 0° is due north |
| `ignition` | **DERIVED, not stored** — computed as `ignitionOn && speed === 0` for idle |
| `odometer` | **EXISTS** at `trip.odometer`, optional. Cartrack still writes `?? 0` |
| `engineHours` | **MISSING** from the canonical type despite being in the EagleTrack catalogue |
| `fuelLevel` | **EXISTS** at `engine.fuelLevel`, percentage, optional. Cartrack still writes `?? 0` |
| `fuelUsed` | **EXISTS** at `fuel.fuelUsed`, optional |
| `fuelConsumption` | **EXISTS** — `fuel.consumptionRate` (L/100km) vs `fuel.instantConsumption` (L/h), correctly separated after the io-199 unit bug |
| `rpm` | **EXISTS**, optional |
| `engineTemperature` | **EXISTS** at `engine.coolantTemp`, optional |
| `batteryVoltage` | **MISSING** from the type — lives in `providerMetadata` |
| `driverId` | **MISSING** from the reading entirely |
| Alert/event info | **EXISTS** — `alerts?: TelematicsAlert[]` |
| Raw/provider metadata | **PARTIAL** — `providerMetadata?: Record<string, unknown>`, explicitly opaque; nothing branches on it |

## Determinations

- **Normalized:** position, speed, heading, timestamp, odometer, fuel level, fuel used, consumption, RPM, coolant temp, alerts.
- **Provider-specific:** battery, signal quality, satellite count, vendor alert ids, IO codes — all in `providerMetadata`.
- **Discarded:** the raw payload is **not** preserved. `providerMetadata` holds a curated subset (`collectMetadataOnlyIo`), not the original response. A field the mapper does not know about is lost at ingest and unrecoverable without re-querying the vendor.
- **Units:** normalized *within* EagleTrack, and validated rather than assumed — `eagletrack-report-values.ts` refuses `gal` (US vs imperial ambiguity), bare `m` (metres vs miles — a 1000× error on an odometer), `L/h` where `L/100km` is expected, and an ambiguous decimal comma. Miles convert exactly. **The canonical type itself carries no unit declarations**, so the discipline lives in one adapter rather than in the contract.
- **Timestamps:** stored as `Date`. Provider time and server time are correctly separated (S8). Timezone interpretation of vendor strings — NOT CONFIRMED FROM REPOSITORY.
- **Missing vs zero:** the *type* distinguishes them correctly and documents why for each field. **EagleTrack honours it; Cartrack does not** (F-2). Deliberate exceptions: `location.speed` keeps `0` (fail-safe), and `location.altitude`/`accuracy` still write `0` as required fields surfaced in no UI.
- **Can provider data overwrite authoritative fleet data?** **Yes.** `digital-twin.service.ts` resolves `latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0`. Telemetry wins over the vehicle record unconditionally, with no plausibility check, no monotonicity check, and no confidence weighting. Cartrack's `odometer: 0` therefore overwrites a real recorded odometer with a placeholder every poll.

**On your specific `fuelLevel ?? 0` concern:** the analysis behind it was right, the type-level fix was made correctly and documented thoroughly, and **it was applied to one of two adapters**. The bug is still live in production for every Cartrack tenant.

---

# 8. Source of truth

| Domain fact | Authoritative today | Conflict handling |
|---|---|---|
| Vehicle identity | **Fleet DB** — vehicles are never auto-created from a provider | Unmatched trackers reported, never created. **Correct.** |
| VIN | **Fleet DB** — not used in provider matching at all | No conflict possible |
| Registration/plate | **Fleet DB** — `findByLicensePlate` is the authority on what counts as a plate | Provider free text is a *lookup key*, never a write. **Correct.** |
| Odometer | **Provider wins**, unconditionally | `latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0`. No reconciliation, no monotonicity check |
| Fuel | **Provider (latest reading)** | No cross-check against fuel logs; the fuel report and the fuel log are separate universes |
| Driver assignment | **Fleet DB** | EagleTrack driver sync creates `DriverProviderLink` records rather than reassigning |
| Location | **Provider**, correctly | Only source |
| Engine hours | **Nobody** — not in the canonical type |
| Maintenance state | **Fleet DB** | Provider maintenance endpoints not consumed |

**Conflict resolution policy: there is no policy.** Identity is fleet-authoritative (right); measurements are last-writer-wins with the provider always being last (wrong for odometer). Nothing records *which* source produced a value on the vehicle record, so a wrong odometer cannot be traced to its source or reverted.

**No conflict exists between Cartrack and EagleTrack** for a given vehicle, because a vehicle matched by one is not matched by the other in practice — but nothing *prevents* two providers claiming one vehicle, and if they did, both would write to `tbltelematics` and the digital twin would read whichever landed last. There is no per-field precedence and no provider priority.

**Manual input and imports** write directly to `tblvehicles`. A user-corrected odometer is silently overwritten by the next telemetry poll.

---

# 9. Real-time vs historical

| Path | Freshness | Mechanism |
|---|---|---|
| Live telemetry | ~10s poll + ≤50s staleness + device interval | REST poll → conditional read-through sync |
| Cached telemetry | **N/A** | Query cache is dead (F-9) |
| Historical | On-demand, caller-specified window | `eagletrack-history.service.ts`, paginated |
| Database | Immediate | `tbltelematics` |
| Read-through | ≤50s | `refreshEagleTrackIfStale` |

- **Freshness guarantees:** none contractual. Best case ~10s, worst case unbounded (no map open → no ingest at all, since the daily cron is vestigial — F-21).
- **Cache TTL:** read-through staleness 50s; Redis lock TTL 25s. The query cache's TTLs are unreachable.
- **Stale-data behaviour:** good. Status is a disjunction (no position OR vendor offline OR age > 60min); `stale` is a separate boolean; alert is a separate field so a red marker keeps its heading wedge.
- **Polling frequency:** frontend ~10s; vendor ≤ once per 50s per tenant.
- **Historical backfill:** on-demand per vehicle per window. No scheduled backfill, no resumable checkpoint.
- **Duplicate prevention:** application-level and correct; **not enforced by an index** (F-3).
- **Ordering guarantees:** none. Rows carry `timestamp`; readers sort. No sequence number.
- **Late-arriving telemetry:** the live poll **rejects** it — a fix older than `lastFixAt` returns `'stale'`. Correct for a live map, but it means a device that buffers offline and dumps on reconnect has those fixes dropped by the live path. History ingest would accept them, but only if someone requests that window.
- **Clock skew:** handled correctly for the comparison that matters (S8).

**Is the live map real-time? No.** It is a ~10s client poll over a store refreshed at most every 50s from a vendor endpoint returning last-known fixes. A WebSocket channel exists and emits `vehicle:location`, but the map does not consume it as its data source. The UI presents this as live.

---

# 10. Event / alert architecture

**Two parallel alert systems exist.**

**1. Derived alerts** — `telematics.service.ts::checkForAlerts`, extracted into `modules/telematics/services/reading-alerts.ts::deriveReadingAlerts` so the live map and the ingestion path share one copy of the thresholds and cannot disagree. Covers speeding, low fuel, DTC codes.

**2. Vendor alerts** — `eagletrack-alert-sync.service.ts` → `telematicsRepository.upsertVendorAlerts`, keyed on `providerAlertKey`.

| Event type | Status |
|---|---|
| Overspeed | **EXISTS** — derived + vendor |
| Idle | **EXISTS** — derived as `ignitionOn && speed === 0` |
| Stop | **EXISTS** — vendor trigger type 4, mapped to `'vendor'`, **deliberately not `'idle'`** |
| Geofence | **EXISTS** — entry/exit/inside with persisted state transitions |
| Route deviation | **MISSING** — `RouteCoordinates` with `tolerance` is defined in the type and no code evaluates it |
| Fuel events | **PARTIAL** — low-fuel derived; filling/leakage counts parsed from the fuel report but not raised as events |
| Device events | **PARTIAL** — offline detection via `getOfflineDevices`; not a domain event |
| Driver events | **MISSING** |
| Maintenance events | **EXISTS** — separate module, event-published |

**Are events persisted, deduplicated, idempotent, tenant-scoped, org-unit-scoped, replayable, auditable?**

- **Persisted:** yes — `tbltelematics_alerts`, and embedded on the reading.
- **Deduplicated:** vendor alerts yes (`providerAlertKey`). Derived alerts **no** — `checkForAlerts` runs per ingest with no suppression window, so a vehicle sitting below the fuel threshold raises a fresh alert on every poll. Combined with F-2 this is the alert-fatigue engine.
- **Idempotent:** vendor yes; derived no.
- **Tenant-scoped:** yes.
- **Org-unit-scoped:** **NO, and it fails closed.** `createAlert` writes **no `orgUnitId`**, while `getActiveAlertsInScope` applies the org-unit predicate — so scoped callers match zero alert rows, always. Not a leak; a feature that is invisible to every scoped role. This is why the live map derives its alert field from the latest reading instead of querying the alert store.
- **Replayable:** **no** — in-memory bus (F-11).
- **Auditable:** partially — `AuditMiddleware` on the event bus, `tblauditlog` with a unique `sequence` index.

**Are provider alerts translated into canonical platform events?** **Partially, and the translation is honest about its limits.** `eagletrack-triggers.map.ts` maps 7 vendor trigger types onto the canonical union, adding `'vendor'` for types 4 and 6 rather than forcing them into `'idle'` — with the reasoning recorded (idle means engine-running-while-stationary everywhere else, so filing stops as idle would inflate the idle metric with parked vehicles and misattribute idle fuel burn once finance posts telemetry costs). Only 3 of 7 trigger types are places, and a geofence is created **only** when the payload yields readable geometry — fabricating one would put a phantom shape into `checkGeofence`, which runs per-ping per-vehicle. That restraint is correct.

But the resulting `TelematicsAlert` is not a domain event: it does not flow through the event bus, cannot trigger a rule, and cannot start a workflow. **Telemetry events and domain events are separate universes.** This is the single structural gap between "Attention" and "Actions" in your intended pipeline.

---

# 11. Data & domain integrity

| Concern | Status |
|---|---|
| Entity identity | **Mixed by design, now with a resolver.** `AllocationPosting.vehicleId` = Mongo `_id`; `Expense`/`FuelLog`/`Trip` = `license_plate`; `NeedsAttentionItem.entityId` = plate. `modules/vehicles/services/vehicle-identity-resolver.service.ts` exists with a test — the bridge is built |
| MongoDB `_id` | **RESOLVED** — `normalizeDoc`/`toObjectId` (S3), with `document-id-normalization.spec.ts` |
| External IDs | UIN in device metadata + link table; **no unique index** |
| VIN | Stored, not used for matching, no uniqueness constraint |
| Registration | **Partial unique index** on `{tenantId, license_plate}` with `partialFilterExpression: {isDeleted: false}` — correctly allows plate reuse after deletion |
| Tracker UIN | **No unique index** (F-3) |
| IMEI | Not modelled |
| Driver identity | `tbldrivers` + org members are two different things; the ownership resolver documents this explicitly |
| Organization ownership | Enforced fail-closed at the repository layer |
| Org-unit ownership | Enforced for most modules; gaps at F-5, F-7, F-14 |
| Financial records | **Append-only enforced in code** — `value-ledger.repository.ts` and the allocation ledger override `update`/`softDelete`/`hardDelete` to throw. Three dedicated tests |
| Telemetry records | Insert-only, no retention (F-12) |
| Duplicate records | Application-level dedupe without index backing (F-3) |
| Soft deletes | Universal via `isDeleted`, `getActiveFilter` |
| Concurrency | **No optimistic locking anywhere.** `scripts/add-versioning-indexes.ts` exists; no `version` field is checked on write |
| Optimistic locking | **MISSING** |
| Race conditions | Unique indexes on `{tenantId,itemKey}` and `{tenantId,attentionItemKey}` correctly close the attention/ledger races. **Telemetry upsert race is open** (F-3). Workflow step approval has no locking — two concurrent approvals of the same step are not serialized |
| Unique indexes | Present on: vehicle plate, spare-part SKU, org slug, audit sequence, lockout, device `{tenantId,deviceId}`, geofence state, attention item, value ledger, OAuth. **Absent on: telemetry tuple, tracker link UIN** |
| Partial unique indexes | Used correctly for vehicles (`isDeleted: false`). Not applied to telematics |
| Referential integrity | Application-level only (expected for Mongo). Cascade delete exists as a script, not as a transaction |

**On your specific concerns:**
- **`BaseRepository` `_id` mismatch** — **RESOLVED** (S3).
- **Missing partial unique indexes for telematics** — **CONFIRMED** (F-3).
- **Duplicate vehicle/device mappings** — **possible**: no unique `{tenantId, uin}` on the link table.
- **Stale mappings** — **handled**: the link is verified against the vehicle table on every read.
- **Deleted vehicles with active trackers** — **handled on read** (link falls through to heuristics or unmatched); the link row itself is never cleaned up.
- **Tracker reassignment** — supported via the admin mapping UI; **no history retained** of what a tracker was previously linked to, so a misattribution window cannot be reconstructed.
- **Driver reassignment** — NOT CONFIRMED FROM REPOSITORY.

---

# 12. Multi-tenancy and org-unit security

**Tenant-level isolation is strong.** Fail-closed resolver, single source of truth, filter-spread order treated as load-bearing in two independent engines, 40 security suites, a registry-driven conformance test. I found **no cross-tenant leak** in this pass.

**Org-unit isolation is where the remaining gaps are.**

| Path | Status |
|---|---|
| Background jobs bypassing authorization | **Confirmed risk** — `process-timeouts` iterates every tenant with no auth (F-1); workers take `tenantId`, not `TenantContext` |
| Cached data crossing tenants | **Latent** — keys are tenant-scoped but **not org-unit-scoped**; safe only because the cache is dead (F-9) |
| Events without tenant context | **Confirmed** — `server/events/utils/event-tenant.utils.ts` exists to address this, but the in-memory bus means no persisted event carries context anyway |
| Exports without tenant filters | **Clean** — conformance-tested (S5) |
| Reports without tenant filters | **Clean** — `orgUnitPredicate` spread last, fails closed on empty units, scoped-collection list read from the registry (S2) |
| Aggregation pipelines missing tenant constraints | **Clean** in reporting; `countOpenBySeverityInScope` was previously fixed |
| Search endpoints | NOT CONFIRMED FROM REPOSITORY |
| Webhook processing without tenant resolution | NOT CONFIRMED FROM REPOSITORY |
| Telemetry ingestion without tenant validation | **CONFIRMED GAP** — F-5 |
| Provider sync writing to wrong tenant | **Clean** — every provider lookup is tenant-scoped; tenancy is decided by the matched vehicle, never by a vendor-controlled field |
| **Active org unit trusted instead of resolved from the entity** | **RESOLVED for attention** (S6) |

## On `AttentionItem.orgUnitId` specifically

**This was the finding, and it has been fixed properly.**

`modules/attention/services/attention-ownership.resolver.ts` resolves each item's true owning org unit from its target entity, per source type: predictive-maintenance and fuel-fraud from the vehicle; driver-risk from the organization member; expense-anomaly from the expense's own inherited unit; compliance and maintenance from the source document; fleet-health from nothing (multi-vehicle recommendations have no single owner → `null`).

The contract is fail-closed on every branch, tenant-scoped on every lookup, and **deliberately not org-unit-scoped on the lookup itself** — because the whole point is to discover an item's true unit, which may legitimately differ from the requester's active unit. `tenantId` is threaded from the caller and never taken from the target, so it is structurally impossible to construct a cross-tenant target.

Backed by `attention-ownership-resolver.spec.ts` and `attention-item-backfill.spec.ts`, with `npm run tenancy:backfill-attention-ownership` for existing rows.

**The remaining instance of this class is `ValueLedgerEntry.orgUnitId`** — it declares the field for the conformance suite, and I did not trace whether it inherits the resolved unit from the attention item or the active context at resolve time. **NOT CONFIRMED FROM REPOSITORY.** Given the ledger is append-only and financial, this is worth one grep before Phase 1.

---

# 13. Events / CQRS / outbox / workers

| Component | Status |
|---|---|
| Domain events | **EXISTS** — `DomainEvent` base, `EventRegistry`, 113+ event names, 5 domain publishers |
| Event bus | **EXISTS but in-memory only** |
| CQRS | **EXISTS and wired** — `instrumentation.ts` → `bootstrapCqrs()` → `bootstrapEvents()` |
| Middleware | **EXISTS** — logging, metrics, audit, retry, validation |
| Handlers | **EXISTS** — 14+ families including workflow-trigger, intelligence, AI-prediction, digital-twin projection, security, webhooks |
| Transactional outbox | **EXISTS as dead code** |
| BullMQ | **EXISTS** — 13 workers |
| Workers | **Do not run on the deployment target** |
| Retries | `RetryMiddleware` on the bus; `BaseWorker` retry config |
| Dead-letter | `infrastructure/queue` dead-letter service exists |
| Idempotency | Per-collection unique keys where present; **no job-level idempotency key** |
| Job deduplication | NOT CONFIRMED FROM REPOSITORY |
| Job ownership / tenant context | Jobs carry `tenantId`, **not `TenantContext`** — no org-unit scope in any worker |
| Failure recovery | Worker-level; no cross-process guarantee |

## Is the outbox wired into production execution?

**No.** It is complete and unused.

- `OutboxPublisher implements IEventPublisher` — the correct interface, ready to substitute.
- `EventBusFactory.getInstance()` returns `new InMemoryEventBus()` unconditionally. No env var, no config, no branch.
- The only reference to `OutboxRepository` outside its own directory is `workers/cleanup.worker.ts:14`, purging processed rows from an empty collection.

**Is `InMemoryEventBus` still used where distributed reliability requires persistence? Yes — everywhere.** Every event in the system: telemetry ingestion, workflow triggers, AI predictions, digital-twin projections, audit records, webhook dispatch. All in-process, all best-effort, all lost on crash, redeploy, or serverless instance recycle. On Vercel — where instances are recycled aggressively — this is not a theoretical loss.

**The gap between these two facts is roughly one factory method and a config flag.** The hard work is done.

---

# 14. Rules / automation / workflows

## Two engines. What each does.

**`RuleEngineService`** (`modules/rules`, ~10 files) — condition evaluation with a 14-operator condition tree, `fireTrigger(trigger, context, tenantId, userId)` fetching active rules for a trigger, `evaluateAndExecute`, `testRule`. Actions dispatch through **`RuleActionRegistry`**, a pluggable executor registry with 5 defaults including `start_workflow`.

**`WorkflowEngine`** (`modules/workflows`, 5 files, 374-line engine) — stateful multi-step approvals: `startWorkflow`, `approveStep`, `rejectStep`, `cancelInstance`, `processTimeouts`, plus escalation and assignee notification.

## Where responsibilities overlap

Less than the "duplicate engines" framing suggests. `RuleEngine` is **stateless condition→action**; `WorkflowEngine` is **stateful multi-step approval**. They compose correctly: `start_workflow` is a registered rule action. **`RuleActionRegistry` is the action seam this platform already has** — building a third engine would be the worst available decision.

## The real problem is not duplication

**Both are registered `level: 'organization'`, and every `WorkflowEngine` method takes `tenantId: string` rather than `TenantContext`.** Combined with F-4 (no permission, no assignee enforcement), the automation layer is:

- not org-unit scoped — a branch manager's approval is indistinguishable from any other branch's
- not permission-gated — any authenticated user can approve, create, or delete
- not idempotent — `startWorkflow` has no dedupe key; firing the same rule twice starts two instances
- not concurrency-safe — two simultaneous approvals of one step are not serialized

## Should they be consolidated? Is it urgent?

**No, and no.** Consolidating two correctly-separated engines would burn effort without addressing a single one of the four problems above. **Do not consolidate.** Fix scope and authorization on both, keep the registry as the action seam, and register any new action type there rather than adding an engine.

**What is urgent** is F-4, because it is a live privilege-escalation path.

---

# 15. AI / intelligence audit

| Service | Real data? | Notes |
|---|---|---|
| Fleet health | **Yes** | Fabricated trend arrays previously removed (documented at :265) |
| Driver risk | **Mostly** | Trends now computed from real 7-day telematics windows. **`Math.random()` survives in incident severity** (F-18) |
| Fuel fraud | **Yes** | Scope-tested |
| Predictive maintenance | **Yes** | Duplicate in `modules/intelligence` now deleted — that 3-round item is closed |
| Expense anomaly | **Yes** | `Math.random() < 0.02` placeholder replaced, documented at :168/:256 |
| Attention | **Yes** | 7 sources, persisted, idempotent, ownership-resolved |
| Opportunities | **MISSING** | No model, no repository, no surface |
| Recommendations | **PARTIAL** | Present in five incompatible shapes |
| Value ledger | **Yes** | Human-confirmed amounts with baseline tiers |

| Property | Assessment |
|---|---|
| Based on real data | **Yes, with one exception** (F-18) |
| Reproducible | **No** — F-18 makes driver-risk incidents non-deterministic; nothing else stores model inputs |
| Explainable | **PARTIAL** — confidence + recommendations exist, but `AIConfidence` is an **enum** on `AIPrediction` and a **number** on `AIResult`. No shared `evidence[]` |
| Persisted | **PARTIAL** — attention items and anomalies yes; per-service outputs computed on read |
| Tenant-safe | **Yes** — six dedicated scope specs |
| Linked to source evidence | **Only in the value ledger**, where `evidenceRefs: string[]` is required and documented as never empty |
| Confidence-scored | **Inconsistently** — two incompatible representations |
| Actionable | **No** — see below |
| Outcome-verified | **PARTIAL and genuinely good** — the value ledger records `modelledAmount` (what the model predicted) vs `realisedAmount` (what a human confirmed), tagged with `baselineTier` T1/T2/T3 by evidence strength. **This is a real model-accuracy feedback loop**, and it is the most commercially differentiated thing in the codebase |

## Is intelligence connected to operational actions?

**No. It is analytics plus a value ledger.**

`attention-resolution.service.ts` writes a `ValueLedgerEntry` when a human resolves an item. **Nothing dispatches an operational action.** No attention item creates a work order, raises a purchase request, schedules maintenance, or starts a workflow. The value ledger records what resolution was *worth*, not what was *done*.

The pieces to close the loop exist and are not connected: `RuleActionRegistry` (the action seam), `WorkflowEngine` (approvals), `AttentionItem` (the trigger), `ValueLedgerEntry` (the outcome). What is missing is the dispatch between them — and the value ledger is deliberately restricted to `fuel_fraud` and `expense_anomaly` because only those two have a well-defined monetary amount, which is the right call and also a ceiling on the loop's coverage.

---

# 16. Financial / value integrity

| Area | Status |
|---|---|
| Cost-per-km | **EXISTS** — allocation ledger, `costPerKm` null (not 0) at zero distance |
| Fuel cost | **EXISTS** in fuel logs; **not posted to the ledger** |
| Expense data | **EXISTS**; **not posted to the ledger** |
| Maintenance cost | **EXISTS**; **not posted to the ledger** |
| Work order cost | **EXISTS**; **not posted to the ledger** |
| Value ledger | **EXISTS** — append-only, unique on `{tenantId, attentionItemKey}`, evidence refs required |
| Savings estimates | **EXISTS** — modelled vs realised with baseline tiers |
| ROI | **PARTIAL** — derivable from the ledger; no surface |
| Financial aggregation | **EXISTS** — `getNetTotalsByCategory`, `getNetTotalsByGlAccount`, indexed |

## The central finding

**Nothing auto-posts into the allocation ledger.** Grep across `modules/fuel`, `modules/expenses`, `modules/maintenance`, `modules/workorders` for `allocationLedger`, `postAllocation`, or `allocationService` returns **nothing**. The cost-per-km engine is complete, correct, indexed, tested — and reads an empty collection unless something posts to it manually. **The finance module is a well-built engine with no fuel line.**

| Check | Finding |
|---|---|
| Client-side totals | NOT CONFIRMED FROM REPOSITORY |
| Mutable historical records | **Clean** — append-only enforced in code, three tests |
| Missing audit trails | **Clean** for the ledger; reversals copy the original's fx rate so a full reversal leaves no residual |
| Race conditions | **Clean** at the ledger — unique index closes the concurrent-resolve race |
| Duplicate transactions | **Clean** — depreciation posting is idempotent via a deterministic `sourceId` |
| Incorrect unit conversion | **Guarded** in the EagleTrack report parser; **unguarded** at the ledger boundary — nothing validates that a distance is km |
| Currency assumptions | **Real gap (F-10)** — the ledger handles multi-currency correctly and refuses to total across currencies; the transactions it draws from carry no currency at all |
| Tenant leakage | **Clean** — `orgUnitId` never accepted from a request body (asserted by a test), derived from a scope-checked vehicle lookup |

**Known open item, previously flagged and still open:** `AllocationLedgerRepository` has **two period semantics** — `buildFilter` (the LIST endpoint) is *starts-within-window*, `getNetTotalsBy*` (the MONEY paths) are *fully-contained*. For a posting spanning a period boundary, the drill-down list will not add up to the header total. All money paths use the totals methods only, and the GL repo deliberately matches fully-contained so both sides of a reconciliation agree — so this is currently a display inconsistency, not a wrong number. It should be standardised on fully-contained in its own commit before anything auto-posts.

---

# 17. Reporting / exports

| Concern | Status |
|---|---|
| Tenant isolation | **Clean** — `source.baseFilter(tenantId)` |
| Org-unit isolation | **Clean** — `orgUnitPredicate` spread **last**, fails closed on empty units, scoped-collection list read from the registry rather than restated |
| Shared reference data | **Deliberately unfiltered** — fuel stations, vendors, SLA policies are shared, and filtering them by org unit would hide rows every branch is meant to see. Documented |
| Performance | **PARTIAL** — capped, but `runFull` at `EXPORT_ROW_CAP = 50,000` is a synchronous request |
| Pagination | **EXISTS** — default 100, max 1,000 preview |
| Aggregation correctness | Grouped path via `$group`; NOT INDEPENDENTLY VERIFIED |
| Large datasets | **Capped, not streamed** — `truncated` + `X-Export-Truncated` header |
| Memory usage | 50k rows materialized in one request |
| Background processing | **MISSING** — documented as the intended extension point |
| Authorization | Permission-gated at controllers; conformance-tested |

Exports are the strongest area of the codebase. The one weakness is that a 50k-row export is a synchronous request, and the code says so honestly rather than pretending otherwise.

---

# 18. Security audit

### S-1 · Middleware does not protect the API surface (ARCHITECTURAL)

`middleware.ts` matcher: `'/((?!_next/static|...|api/(?!v\\d+/).*).*)'`. Non-versioned `/api/*` is **excluded**. The 401 branch for `path.startsWith('/api/')` inside the middleware is effectively dead for all 303 real routes.

Every route is therefore self-defending via `withAuth()`/`withSession()`. My scan found 22 routes with no recognizable auth reference; 20 are legitimate (login/refresh/health/version/retired/invite-accept) or use a wrapper my pattern missed. **But the structure means a forgotten wrapper is an open endpoint, and there is no test that catches it** — exactly the failure mode `module-scope-conformance.spec.ts` was built to eliminate for tenancy.

### Findings by category

| Area | Status |
|---|---|
| Authentication | **PARTIAL** — dual system unified behind `getAuthContext()`; revocation checked centrally after a documented fix |
| Authorization | **PARTIAL** — good coverage except workflows (F-4) and telematics ingest (F-5) |
| RBAC | **PARTIAL** — `PermissionService` is sound; **no `WORKFLOW_*`, no `DRIVER_*`** |
| Session handling | Custom access token + refresh; httpOnly cookie |
| Cookies | httpOnly; `SameSite`/`Secure` NOT CONFIRMED FROM REPOSITORY |
| API endpoints | 303, per-route auth (S-1) |
| Webhooks | Subscriptions + deliveries + dispatch handler; signature verification NOT CONFIRMED |
| Secrets | AES-256-GCM at rest, prod fail-closed (S7). **But F-6: a live token is committed** |
| Environment variables | `.env*` gitignored, no `.env` in archive. `CRON_SECRET` fails open (F-1); `SECRETS_ENCRYPTION_KEY` fails closed in prod (correct) |
| SSR/Server Actions | NOT CONFIRMED FROM REPOSITORY |
| CSRF | **NOT CONFIRMED** — no CSRF token machinery found. Cookie-based auth + mutating `GET` cron routes (F-1) is a CSRF-shaped surface |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` audit performed |
| Injection | Zod validation at controllers; **NoSQL operator injection not systematically audited** — `report-query.engine.ts` builds `$match` from user filters through `buildMongoFilter`, which is field-type-aware, but I did not verify it rejects `$`-prefixed keys |
| MongoDB query safety | `ObjectId.isValid()` guards on `findById`; filter-spread order correct |
| Command injection | No `exec`/`spawn` found in the audited paths |
| Path traversal | NOT CONFIRMED |
| File uploads | `app/api/organizations/[id]/logo` is rate-limited; content validation NOT CONFIRMED |
| Rate limiting | **WEAK** — F-8 |
| Brute force | **EXISTS** — `tblaccountlockouts` + `tblloginattempts`, both uniquely indexed |
| Privilege escalation | **CONFIRMED** — F-4 |
| IDOR | **CONFIRMED** — F-5 (any `vehicleId` in tenant); mitigated elsewhere by `assertVehicleInScope` |
| Tenant isolation | **Strong** (§12) |
| Sensitive logging | **Good** — `redactToken()`, endpoint-only logging (origin+path, never full URL), errno-code-only transport messages. This was done deliberately and well |

### Credentials found — locations only, values not reproduced

1. **EagleTrack production API token** — `manual-eagletrack-trigger-sync.md`, `tests/security/telematics-eagletrack-token-leak.spec.ts`, and three CHANGELOGs. **Committed in plaintext. Rotate and purge from files.** (F-6)
2. **Per `SECURITY-CREDENTIALS.md`** (values not in the archive, exposure documented): MongoDB Atlas user, `NEXTAUTH_SECRET`, `JWT_SECRET`, third-party API keys — all documented as compromised via a prior archive/transcript and **still unrotated**.

Rotating the token secrets logs everyone out, which is the desired outcome; `npm run db:purge-sentinels -- --confirm` is documented as the companion step for the ~4,500 legacy-sentinel refresh tokens.

---

# 19. Observability / operations

| Area | Status |
|---|---|
| Logging | **EXISTS** — `monitoring` + `structured-logger.ts` |
| Structured logging | **EXISTS** — correlation IDs via `runWithContext` in `withAuth` |
| Metrics | **EXISTS** — Prometheus registry, `/api/observability/metrics` |
| Tracing | **EXISTS** — OTel, root span per `withAuth` request |
| Error monitoring | **MISSING** — F-25 |
| Health checks | **EXISTS** — `/api/health` (liveness) and `/api/health/ready` (readiness, 503 with per-dependency latency). Well-built |
| Provider health | **MISSING** |
| Queue health | **EXISTS** — `fleet_queue_depth` gauge + poller (in the worker process only) |
| Database health | **EXISTS** — ping + `db-monitoring.ts` + slow-query counter |
| Cron health | **MISSING** |
| Alerting | **PARTIAL** — `alert-rules.ts` with `ALERT_THRESHOLDS`, `AlertNotificationHandler` |
| Operational dashboards | **MISSING** |

## Can operators answer the six questions?

| Question | Answer |
|---|---|
| Is telematics ingestion working? | **No** — no ingest metric. Only per-tenant `lastSyncAt` on a config document, queried by hand |
| Which provider is failing? | **No** — no provider dimension in any metric |
| Which vehicles are stale? | **Partially** — `getOfflineDevices` exists and the live map computes staleness, but there is no fleet-wide or cross-tenant view |
| Which jobs are failing? | **Partially** — `fleet_queue_job_total` has a status label, but only in the worker process, which does not run on Vercel |
| Which tenants are affected? | **No** — metrics are not tenant-dimensioned (deliberate, for cardinality; the cost is no per-tenant view) |
| How long has a provider been unavailable? | **No** — `lastSyncStatus` is a single overwritten value with no history and no duration |

**Existing metrics:** HTTP duration/count, DB duration/slow/errors, queue duration/count/depth, workflow step duration/instances/active, plus a generic gauge. **There is not one telematics metric.** The subsystem doing the most external I/O, on the least reliable dependency, is the least observable part of the platform.

---

# 20. Testing

**767 tests, 50 suites, 100% passing** (verified). Genuinely impressive discipline — but the shape matters more than the count.

| Type | Coverage |
|---|---|
| Unit | **10 suites** — parsers, IO maps, report values, error classification, live-map status |
| Integration | **Effectively none** — `test:integration` runs `--passWithNoTests` |
| API | **None** — no route-level tests |
| Security | **40 suites** — the bulk of the estate |
| Tenancy | **Excellent** — `tenant-isolation`, `tenant-scope`, `tenant-hierarchy`, `org-unit-isolation`, `org-unit-descendants`, `org-unit-descendants-objectid`, plus per-module scope specs |
| Concurrency | **None** |
| Telematics adapter | **PARTIAL** — `eagletrack-adapter`, `eagletrack-api-client`, `eagletrack-io-map`, `eagletrack-payload-parsers`, `eagletrack-report-values`, `eagletrack-worker-wiring`. **Zero Cartrack adapter tests** — which is exactly why F-2 survived |
| Contract | **None** — no shared provider contract to test against |
| Worker | **One** — `eagletrack-worker-wiring` |
| E2E | **None** — `test:e2e` is `echo "no e2e suite yet"; exit 0` |

**Genuinely covered:** cross-tenant isolation, org-unit scoping, export scoping, module-scope conformance, append-only financial invariants, EagleTrack parsing, `_id` normalization.

**Untested:** every HTTP route, every permission decision at the route boundary, workflow authorization (which is why F-4 survived), the Cartrack adapter (which is why F-2 survived), concurrency, all 13 workers, the event bus, the outbox, and anything requiring a live database.

**Pattern worth naming:** the tests are overwhelmingly **structural** — they read source files and assert properties about them (`module-scope-conformance`, `export-scope-conformance`, `finance-permissions-conformance`). That is a deliberate and effective choice for "did someone forget to scope this", and it is why tenancy regressions stopped. It cannot catch a behavioural bug. **The two CRITICAL findings that survived (F-2, F-4) are both in areas with no test of either kind** — and both would have been caught by extending the structural pattern that already works here.

---

# 21. Build / CI / dependency health

## Exact current commands

| Purpose | Command | Works? |
|---|---|---|
| Development | `npm run dev` (`next dev --turbopack`) | Yes |
| Type check | `npm run type-check` (`tsc --noEmit`) | **Yes — 0 errors, verified** |
| Tests (all) | `npm test` (`jest`) | **Yes — 767/767, 50 suites, verified** |
| Tests (CI) | `npm run test:ci` (`jest --ci --runInBand`) | Yes |
| Security tests | `npm run test:security` | Yes |
| Unit tests | `npm run test:unit` | Yes |
| Integration | `npm run test:integration` | Vacuous (`--passWithNoTests`) |
| E2E | `npm run test:e2e` | **Stub** — `echo; exit 0` |
| Performance | `npm run test:performance` | **Stub** — `echo; exit 0` |
| Build | `npm run build` (`next build`) | Fails at `next/font` without network (F-23) |
| Lint | `npm run lint` (`next lint`) | **Deprecated in Next 15**; also `ignoreDuringBuilds: true` |
| Format | **No script** | — |
| CI | `.github/workflows/ci.yml` | **Cannot run** — starts with `npm ci` |

Plus ~45 operational scripts (`db:*`, `tenancy:*`, `auth:doctor`) — a genuinely valuable operational toolkit.

## Verification results

| Check | Result |
|---|---|
| `package.json` | Valid, 98 root deps |
| `package-lock.json` | v3, **root entry perfectly in sync** (0 missing, 0 drift) |
| **`npm ci`** | **FAILS** — 6 transitive packages missing: `dom-accessibility-api@0.5.16`, `lz-string@1.5.0`, `pretty-format@27.5.1`, `dequal@2.0.3`, `ansi-styles@5.2.0`, `react-is@17.0.2` (all under `@testing-library/dom`) |
| `npm install` | Succeeds — 1,448 packages |
| Node version | **No `engines` field**; CI pins 20 |
| Next.js | 15.3.9 |
| TypeScript | 5.8.3, **0 errors**, `ignoreBuildErrors: false` |
| Prisma | Not used (raw MongoDB driver) |
| Deprecated deps | `recharts@2.15.4` (branch EOL); `next lint` removed in Next 15 |
| Build-time network | **Yes** — `next/font/google` |
| Webpack | `IgnorePlugin` for unused OTel optional peers; one known `@opentelemetry` critical-dependency warning |

**The `npm ci` failure is the single highest-leverage fix in this report.** It is one `npm install` + commit, and until it lands, CI cannot run, which means **none of the 767 tests execute on any pull request** — the conformance suites that exist specifically to prevent regressions are not protecting anything.

---

# 22. Known current issues — verified or rejected

| # | Issue | Verdict | Evidence |
|---|---|---|---|
| 1 | package-lock out of sync | **CONFIRMED** | `npm ci --dry-run` fails on 6 transitive deps. Root entry is in sync — the desync is purely transitive |
| 2 | Cartrack `fuelLevel ?? 0` | **CONFIRMED** | `cartrack.adapter.ts:135`, plus 9 more fabricated zeros in the same block. Type was widened to prevent exactly this; only EagleTrack was updated (F-2) |
| 3 | Missing partial unique indexes | **CONFIRMED** | 6 telematics collections have no indexes at all; no unique on the telemetry tuple or `{tenantId,uin}`; no TTL on the geocode cache (F-3) |
| 4 | BaseRepository `_id` mismatch | **RESOLVED** | `normalizeDoc`/`toObjectId` at `base.repository.ts:190`, with `document-id-normalization.spec.ts` (S3) |
| 5 | Outbox unused | **CONFIRMED** | Only consumer is `cleanup.worker.ts:64`, purging a collection nothing writes to. `EventBusFactory` returns `InMemoryEventBus` unconditionally (F-11) |
| 6 | Duplicate rule/workflow engines | **PARTIALLY CONFIRMED** | Both exist and compose correctly via `start_workflow`. **The real defect is not duplication** — it is that both are org-level and neither is permission-gated (F-4, F-14) |
| 7 | `CRON_SECRET` | **CONFIRMED — worse than stated** | Five fail-open guards on mutating `GET` routes, including unauthenticated tenant enumeration and a global permission-cache flush (F-1) |
| 8 | `REDIS_URL` | **PARTIALLY CONFIRMED** | Optional platform-wide and handled gracefully everywhere. But absence silently disables **all 13 workers**, and the read-through lock fails open. On Vercel, Redis absence is the default state |
| 9 | Environment configuration | **CONFIRMED** | `CRON_SECRET` fails open; `SECRETS_ENCRYPTION_KEY` fails closed in prod (correct); no `engines`; `vercel.json` schedules a daily cron whose own code says per-minute was needed (F-21) |
| 10 | Sentry incompatibility | **RESOLVED / superseded** | `@sentry/nextjs` removed from `package.json`; `sentry.ts` is a documented no-op shim; OTel wired instead. **Net: no error monitoring** (F-25) |
| 11 | `next/font` build fetch | **CONFIRMED** | `app/layout.tsx:3`, sole occurrence (F-23) |
| 12 | EagleTrack leaking provider assumptions into domain code | **CONFIRMED** | 8 specific coupling points enumerated in §5 — `providerSourceFor`'s `'cartrack'` default, the `LiveMapDataSource` union, vendor fields on `TelematicsAlert`/`Geofence`, vendor-named route trees, `deviceId` prefixes as provider identity |
| 13 | Read-through not suitable for scale | **CONFIRMED** | Read path performs writes; fails open across instances; no map open → no ingest; vendor latency bounds map p99 (F-16, F-21) |
| 14 | Missing telemetry ingestion idempotency | **PARTIALLY CONFIRMED** | History ingest **is** idempotent in application code (in-batch dedupe + `$setOnInsert` on a 4-tuple). **No unique index backs it**, so concurrent upserts can both insert. The **live** path has no idempotency at all beyond the per-device staleness guard (F-3) |
| 15 | Missing sync checkpoints | **PARTIALLY CONFIRMED** | `lastSyncAt`, `lastDriverSyncAt`, per-device `lastFixAt` all exist. **No resumable history checkpoint** — a truncated backfill records that it truncated, not where to resume |
| 16 | Missing provider health monitoring | **CONFIRMED** | Only `lastSyncStatus`/`lastSyncAt` on a config doc. No metric, no endpoint, no alert, no duration, no history (§19) |
| 17 | Missing canonical telemetry contract | **CONFIRMED** | `TelematicsData` is a persistence model, not a contract: no `provider`, no `receivedAt`, no `driverId`, no `engineHours`, no unit declarations, no raw preservation. Adapters populate it inconsistently (F-2, §7) |

---

# 23. Commercial / enterprise readiness

| Scenario | Verdict |
|---|---|
| Multiple fleet companies | **Yes** — tenant isolation is the strongest part of the system |
| Hundreds of vehicles | **Yes, with F-1/F-4/F-5 closed** |
| Thousands of vehicles | **No** — F-12 (no retention), F-13 (per-ping geofence queries), F-16 (read-through) all break first |
| Multiple telematics providers | **No** — §5 |
| High-frequency telemetry | **No** — insert-per-ping, no retention, no time-series store, unindexed upsert key |
| Long historical retention | **No** — no retention policy at all |
| Background synchronization | **No** on the current deployment target — workers require Redis and a long-lived process; Vercel provides neither |
| Enterprise reporting | **Yes** — scoped, capped, conformance-tested; needs background jobs above 50k rows |
| Customer-specific integrations | **No** — no plugin seam for provider integrations (`modules/plugins` exists but is `level: 'platform'` and unrelated) |

## First bottlenecks, in the order they will actually appear

1. **~50–100 vehicles** — Cartrack low-fuel alert storm (F-2). Not a performance limit; a *credibility* limit. Operators stop trusting alerts in week one.
2. **~200 vehicles** — read-through amplification (F-16). Every map load can trigger a full roster + status fetch; vendor latency becomes map latency.
3. **~500 vehicles** — geofence evaluation (F-13): 2+ queries per ping, sequential alert writes.
4. **~1,000 vehicles / 6 months** — `tbltelematics` growth (F-12). ~620M docs/year at 1,000 vehicles, no retention, no TTL, unindexed upsert key.
5. **Second production tenant on a different provider** — the provider abstraction gap (§5) becomes a delivery blocker rather than a design concern.
6. **First enterprise security review** — F-1, F-4, F-5 and the committed token (F-6) are all findings a competent reviewer surfaces in a day.

**On the commercial framing:** if the beachhead is Southern African (the tenant names suggest it), the incumbents are Cartrack, Tracker, MiX by Powerfleet, Ctrack and Netstar, not Samsara/Motive. That has two consequences the code should reflect: US compliance modules (IFTA/ELD/HOS) are not the differentiator, and **the provider abstraction is the product** — in a market where customers already own hardware from one of five incumbents, "we integrate with whatever you already have" is the wedge. That makes §5 a commercial priority, not just an engineering one.

---

# 24. Improvement roadmap

## Phase 0 — Close the control plane and restore CI

**Objective:** eliminate unauthenticated privilege escalation and make the existing test estate actually run.
**Why now:** F-1, F-4, F-5 are live. CI has never run, so the conformance suites protecting tenancy are protecting nothing.
**Problems solved:** F-1, F-4, F-5, F-19, F-6, and the `npm ci` desync.
**Key changes:** fail-closed `CRON_SECRET` + move to `POST` + timing-safe compare; merge `roles.workflow-addendum.ts` into the real `Permission` enum and fix `isAuthorizedForStep`'s permissive branch; permission + `assertVehicleInScope` on telematics ingest; regenerate the lockfile; rotate and purge the committed token; add a route-auth conformance test.
**Dependencies:** none.
**Tests required:** route-auth conformance (structural, mirroring `module-scope-conformance`); workflow authorization unit tests; a cross-role ingest rejection test.
**Risks:** low. Fixing fail-open cron guards will break any caller relying on the unset-secret path — deliberate, and worth a deploy note.
**DoD:** `npm ci` green; CI runs and passes; no route reaches a mutation without an auth wrapper; the new conformance test fails when a wrapper is removed.

## Phase 1 — Telemetry data integrity

**Objective:** make a stored reading mean the same thing regardless of which provider produced it.
**Why now:** F-2 is producing false alerts today and corrupting odometers today. Every downstream phase inherits this data.
**Problems solved:** F-2, F-3, F-18, and the odometer-overwrite in §8.
**Key changes:** remove fabricated zeros from the Cartrack adapter (omit, per the type's existing contract); add the missing telematics indexes including the unique telemetry tuple, unique `{tenantId,uin}`, and a geocode TTL; replace `Math.random()` in driver-risk severity; add a plausibility/monotonicity guard before telemetry overwrites a vehicle odometer.
**Dependencies:** Phase 0 (CI must run for the index migration to be verifiable).
**Tests required:** Cartrack adapter unit tests asserting absent-not-zero (none exist today); a concurrent-upsert test; an index-presence test mirroring `finance-indexes.spec.ts`.
**Risks:** the unique index requires a duplicate sweep on existing data first. Do not ship an unreviewed migration into a soft-deleting collection.
**DoD:** no `?? 0` on any measurement in any adapter; index script creates every telematics index; existing duplicates identified and resolved before the unique index is applied.

## Phase 2 — Provider contract and registry

**Objective:** make a third provider an adapter, not a refactor.
**Why now:** commercially load-bearing in an incumbent-hardware market; and every telemetry fix made without it has to be made twice.
**Problems solved:** §5 in full, F-26, and the structural cause of F-2.
**Key changes:** `TelematicsProvider` interface with a capability descriptor; provider registry; `provider` and `externalDeviceId` as first-class fields on the reading (backfilled from the `deviceId` prefix); `receivedAt`; unit declarations on the contract; a provider-agnostic refresh strategy replacing the EagleTrack block in `live-map.service.ts`; open the `LiveMapDataSource` union.
**Dependencies:** Phase 1.
**Tests required:** **provider contract tests** — one suite both adapters must pass. This is the missing test category that would have caught F-2.
**Risks:** medium. Touches the live map. Backfilling `provider` onto existing device rows is a data migration.
**DoD:** a third adapter can be added by implementing the interface and registering it, with no edit to any file outside its own directory and the registry.

## Phase 3 — Event durability

**Objective:** make event delivery survive a crash.
**Why now:** prerequisite for any action dispatch. Actions that can be silently dropped are worse than no actions.
**Problems solved:** F-11.
**Key changes:** wire `OutboxPublisher` into `EventBusFactory` behind config; run `OutboxProcessor`; add per-event idempotency keys; decide the deployment topology (this phase forces the question — Vercel + no workers is not compatible with durable delivery).
**Dependencies:** Phase 0.
**Tests required:** outbox publish/process/retry/dead-letter; crash-recovery integration test.
**Risks:** medium — depends on a topology decision you have not yet made.
**DoD:** an event published during a simulated crash is delivered after restart, exactly once.

## Phase 4 — Ingestion and retention at scale

**Objective:** survive 1,000+ vehicles.
**Why now:** F-12 has no ceiling; the longer it runs the more expensive the fix.
**Problems solved:** F-12, F-13, F-16, F-20, F-21.
**Key changes:** telemetry retention policy + TTL or rollup; batch geofence evaluation; move sync off the read path onto a real scheduler; stream the backup instead of buffering it.
**Dependencies:** Phases 2 and 3, plus the topology decision.
**Risks:** high — retention deletes data. Rollup strategy must be agreed before anything is dropped.
**DoD:** telemetry volume bounded; geofence evaluation sub-linear in fleet size; ingestion continues with no user session open.

## Phase 5 — Automation scope and authorization

**Objective:** make actions org-unit scoped and properly authorized.
**Problems solved:** F-14; completes F-4.
**Key changes:** migrate `WorkflowEngine` from `tenantId` to `TenantContext`; split org-level policy from org-unit action instances (my recommendation over either extreme); add idempotency keys to rule firing and workflow starts.
**Dependencies:** Phase 0.
**Note:** **do not consolidate the two engines.** Keep `RuleActionRegistry` as the action seam.

## Phase 6 — Close the intelligence loop

**Objective:** attention items dispatch real operational actions.
**Problems solved:** §15's core gap; unlocks the Opportunity model.
**Key changes:** attention → `RuleActionRegistry` dispatch; auto-post fuel/expense/maintenance into the allocation ledger (F-10's prerequisite: give transactions a currency first); standardise the two period semantics; unify the five confidence shapes behind one `evidence[]`.
**Dependencies:** Phases 3 and 5.
**Risks:** this is where wrong data becomes wrong money. Do not start before Phase 1.

## Phase 7 — Observability for telematics

**Objective:** let an operator answer the six questions in §19.
**Key changes:** provider-dimensioned metrics (sync success/failure/duration/staleness); provider health endpoint; cron heartbeat; error-monitoring backend.
**Dependencies:** Phase 2 (needs a provider identity to label metrics with).

---

# 25. First implementation phase

## **Phase 0 — Close the control plane and restore CI.**

### Why it must come first

Three of the four CRITICAL findings are live, unauthenticated or unauthorized paths that require no sophistication to exploit: a fail-open secret check on routes that enumerate every tenant and flush the permission cache (F-1); an approval engine that returns `true` for any authenticated user (F-4); a telemetry ingest that accepts any `vehicleId` in the tenant from any role (F-5).

And underneath them: **CI has never run.** `npm ci` fails, so `.github/workflows/ci.yml` dies at step one. The 767 tests and — critically — the conformance suites built specifically to stop tenancy regressions have never gated a single pull request. Every correctness claim in every subsequent phase depends on a pipeline that does not currently execute.

### What it unlocks

Every other phase becomes verifiable. Phase 1's index migration, Phase 2's contract tests, Phase 3's crash-recovery test — none of them means anything until CI runs. It also establishes the route-auth conformance test, which extends the one pattern in this codebase with a demonstrated track record of eliminating a whole bug class.

### What risks it removes

Unauthenticated cross-tenant enumeration; unauthenticated authorization mutation; in-tenant privilege escalation through the approval chain; in-tenant data fabrication through telemetry ingest; a committed live vendor credential; and the silent absence of regression protection.

### Why the other phases should wait

**Phase 1** (telemetry integrity) is the more *interesting* work and my instinct was to lead with it — but shipping an index migration and an adapter rewrite into a repository where CI cannot run means shipping them unverified, into a soft-deleting collection, with a unique index that will fail on existing duplicates. **Phase 2** (provider contract) is the commercially load-bearing one, and it is a refactor of a subsystem whose ingest endpoint currently accepts fabricated data from any user. **Phase 3** requires a deployment-topology decision you have not made. **Phase 6** would connect intelligence to actions while the action engine authorizes any authenticated user.

Phase 0 is also the smallest: five guard rewrites, one enum merge, one authorization branch, one permission check, one lockfile, one credential rotation, one new conformance test. It is a days-not-weeks phase, and it makes everything after it provable.

---

# 26. Final priority matrix

| Priority | Problem | Severity | Evidence | Business impact | Dependency | Phase |
|---|---|---|---|---|---|---|
| **P0** | Fail-open `CRON_SECRET` on 5 mutating GET routes | CRITICAL | `expire-grants:21`, `process-timeouts:25`, +3 | Unauthenticated tenant enumeration + permission-cache flush | none | 0 |
| **P0** | Workflow approval: no RBAC, no assignee check | CRITICAL | `workflow-engine.service.ts:333`; addendum never merged | Any user approves any step; gates spend | none | 0 |
| **P0** | Telematics ingest unauthorized + unscoped | CRITICAL | `telematics.controller.ts:23` | Any user fabricates telemetry for any vehicle | none | 0 |
| **P0** | `npm ci` fails → CI has never run | HIGH | 6 transitive deps missing | 767 tests gate nothing | none | 0 |
| **P0** | Live vendor token committed | HIGH | 5 tracked files | Full read access to customer fleet telemetry | none | 0 |
| **P1** | Cartrack fabricated zeros | CRITICAL | `cartrack.adapter.ts:128-152` | Low-fuel alert on every poll; odometer corruption | Phase 0 | 1 |
| **P1** | No unique index on telemetry tuple / `{tenantId,uin}` | CRITICAL | `indexes.telematics-addendum.ts` | Duplicate readings; duplicate tracker links | Phase 0 | 1 |
| **P1** | 6 telematics collections unindexed; no geocode TTL | HIGH | same | Collection scans; unbounded cache | Phase 0 | 1 |
| **P1** | `Math.random()` in driver-risk severity | MEDIUM | `driver-risk.service.ts:465` | Non-reproducible safety classification | Phase 0 | 1 |
| **P1** | Telemetry overwrites authoritative odometer | HIGH | `digital-twin.service.ts` fallback chain | Corrupts cost-per-km inputs | Phase 0 | 1 |
| **P1** | No provider abstraction | CRITICAL (arch) | §5, 8 coupling points | 3rd provider = refactor, not adapter | Phase 1 | 2 |
| **P1** | WebSocket not org-unit scoped | HIGH | `server.ts:69` + `telematics.service.ts:30` | Cross-branch live position visibility | none | 2 |
| **P2** | Outbox dead; in-memory bus only | HIGH | `EventBusFactory` unconditional | Events lost on crash/redeploy | topology decision | 3 |
| **P2** | No telemetry retention | HIGH | no cleanup job, no TTL | ~620M docs/yr at 1,000 vehicles | Phase 2 | 4 |
| **P2** | Geofence eval per ping | HIGH | `telematics.service.ts:37,188` | 2+ queries/ping | Phase 2 | 4 |
| **P2** | Read-through does writes on the read path | HIGH | `eagletrack-read-through.service.ts` | Map p99 = vendor latency; no map = no ingest | Phase 3 | 4 |
| **P2** | Rate limiting in-memory | HIGH | `rate-limit.ts:6` | Ineffective on serverless | none | 4 |
| **P2** | Both action engines org-level | MEDIUM | registry `level:'organization'` | No branch-level automation | Phase 0 | 5 |
| **P2** | Nothing posts into the allocation ledger | HIGH | grep: no callers | Cost-per-km engine reads empty | Phase 3 | 6 |
| **P2** | Multi-currency is types only | HIGH | `finance-currency.addendum.ts` | Silent currency mixing in cost figures | Phase 6 | 6 |
| **P2** | No provider health / telematics metrics | HIGH | §19 six questions | Operators cannot diagnose ingestion | Phase 2 | 7 |
| **P3** | Query cache invalidate-only; tenant-keyed | MEDIUM | one caller, in a worker | Net cost; latent leak if wired | — | 7 |
| **P3** | Backup buffers whole DB in memory | MEDIUM | `backup.worker.ts:30` | OOM at scale; no DR | — | 4 |
| **P3** | No error monitoring | MEDIUM | Sentry removed, no replacement | Blind to production errors | — | 7 |
| **P3** | Alerts written without `orgUnitId` | MEDIUM | `createAlert` vs `getActiveAlertsInScope` | Alert store invisible to scoped roles | — | 5 |
| **P3** | No optimistic locking anywhere | MEDIUM | no version check on write | Lost updates under concurrency | — | 5 |
| **P3** | `next/font` build-time fetch | LOW | `app/layout.tsx:3` | Breaks air-gapped CI | — | 0 |
| **P3** | Repo-root artifact files | LOW | `console.log(JSON.stringify(d` etc. | Hygiene | — | 0 |

---

# 27. Final executive verdict

**A. Current architecture maturity — Moderate-to-high, and unusually uneven.**
The tenancy layer, repository layer, reporting engine and export paths are better than most commercial products at this stage — not because they are elaborate, but because the failure modes are documented *in place*, with the original broken code preserved in the comment above each fix. That is rare and it is worth protecting. The telematics layer, the event layer and the operational layer are at a much earlier stage. This is a codebase where one part has learned from production and the rest has not yet been to production.

**B. Production readiness — Not ready.** Three live CRITICAL authorization gaps, a committed vendor credential, and a CI pipeline that has never executed. With Phase 0 complete, ready for a controlled single-tenant production deployment.

**C. Enterprise readiness — Not ready.** No error monitoring, no provider health, no retention policy, no durable event delivery, no E2E or integration tests, and background workers that do not run on the deployment target. An enterprise security review surfaces F-1, F-4, F-5 and F-6 in a day.

**D. Telematics readiness — Adequate for one provider, not architected for many.** The EagleTrack integration is careful, well-reasoned work — the staleness guard, the matching precedence, the four-outcome cell parser, the refusal to attribute unattributable fuel rows. But there is no provider contract, no registry, no health model, and `providerSourceFor` defaults unknown devices to Cartrack. At 5–20 providers the current shape does not hold.

**E. Security posture — Strong at the tenant boundary, weak at the route boundary.** Cross-tenant isolation is fail-closed, single-sourced and conformance-tested; I found no cross-tenant leak. But authorization is applied per route with no structural enforcement, and three routes that forgot it are the three CRITICAL findings.

**F. Data integrity posture — Strong where it was audited, weak where it was not.** Financial records are append-only and enforced in code. The `_id` type lie is closed. Attention ownership is resolved from the entity. Meanwhile one adapter fabricates measurements the type system forbids, the idempotency key has no index, and there is no optimistic locking anywhere.

**G. Scalability posture — Weak.** No telemetry retention, per-ping geofence queries, an ingest path that runs on reads, and workers that do not run at all on the target platform. Hundreds of vehicles: yes. Thousands: no.

**H. Biggest architectural risk — The absence of a provider contract, compounded by the absence of durable event delivery.** These two are the same risk viewed from different ends: nothing guarantees what a reading *means* on the way in, and nothing guarantees an event *arrives* on the way out. Every intelligence and finance feature built between them inherits both.

**I. Biggest commercial strength — The value ledger, and the discipline that produced it.** `modelledAmount` vs `realisedAmount`, tagged T1/T2/T3 by evidence strength, with required evidence references and no update path. That is a real model-accuracy feedback loop, and almost nobody in this market has one — competitors sell predictions, not verified outcomes. It is the genuine differentiator, and it is currently sitting on top of a ledger nothing posts to.

The second strength is cultural and shows up everywhere in the code: this codebase consistently **refuses to guess**. Unmatched trackers are reported, not invented. Fuel rows that cannot be attributed are dropped, not stamped. Geofences are skipped when geometry is unreadable rather than fabricated. Units are validated rather than assumed. `AttentionItem` ownership returns `null` rather than defaulting. That instinct is the reason the tenancy work held, and it is the most valuable thing here.

**J. Recommended first implementation phase — Phase 0: close the control plane and restore CI.**

---

**NO IMPLEMENTATION HAS BEEN PERFORMED.**

**Awaiting approval before Phase 1.**
