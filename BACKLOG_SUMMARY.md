# Backlog items 2–7 — implementation summary

Items 1 (handler idempotency) and 8 (live-map `dataStale` UI) were
already applied and were **not** touched.

**Verification, up front:**

| | Baseline (as received) | After |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx jest` | 83 suites / 1393 passed, 21 skipped | **94 suites / 1534 passed, 21 skipped** |
| `npm run test:security` | 55 suites / 870 passed | **65 suites / 1011 passed** |
| `next build` (fonts stubbed) | 218 static pages, 0 errors | **218 static pages, 0 errors** |

Zero failures at baseline and zero after. The 21 skipped are the
pre-existing integration suite, which needs a real MongoDB (see
`HARDENING_REMAINING.md` §1). The build was run on a throwaway copy with
`next/font` stubbed, because `next/font` fetches Geist from Google at
build time and this environment has no route to it — a pre-existing
condition, unrelated to these changes. The **baseline builds to the same
218 pages**, so nothing here changed the route surface.

Open items, manual steps and deliberate limits are in
**`BACKLOG_REMAINING.md`**. The three that need you before this is fully
live: run `npm run db:backfill-alert-orgunits`, run `npm run db:indexes`,
and decide `TRUSTED_PROXY_HOPS` for your topology.

---

## Item 2 · Alert store `orgUnitId`

**The defect.** `createAlert` inserted
`{ vehicleId, ...alert, tenantId, createdAt, isDeleted }` and nothing
else, while `getActiveAlertsInScope` applies the standard `orgUnitId`
predicate. For every org-unit-scoped caller that predicate matched zero
rows — so the alert store was permanently empty for exactly the roles it
was built for. Fail-**closed**, so never a leak; and invisible, because
an empty list looks like "no alerts", which is why it survived several
phases.

**What was done.**

* New `modules/telematics/services/alert-ownership.resolver.ts` resolves
  the owner **from the vehicle record**, memoised for 30 s per
  `(tenant, vehicle)` — matching the geofence cache's window and
  reasoning, so a speeding vehicle does not cost a Mongo round trip per
  fix.
* `createAlert` now takes a **required** `ResolvedAlertOwnership`
  parameter, a type only that resolver can produce. The original defect
  was an omission at a call site; an *optional* parameter would let the
  next call site make the same omission and still type-check.
* `orgUnitId` is spread **after** the alert object, so ownership owns the
  key — the same rule as the scope predicate being spread last in every
  scoped filter.
* New `orgUnitResolution` field records **why** a row has no org unit
  (`vehicle-unassigned` / `vehicle-not-found` / `lookup-failed`), so a
  row nobody can see is self-explanatory instead of a mystery.
* Both write paths wired: `processAlerts` (resolved once per batch — one
  reading, one vehicle) and `triggerGeofenceAlert`.
* Backfill: `scripts/backfill-alert-org-units.ts`
  (`npm run db:backfill-alert-orgunits`), dry-run by default, audited to
  `tbltenant_repair_audit`, with `--revert <runId>`.

**Two decisions worth flagging.**

1. The reading already carries an `orgUnitId`, and it is **not** used as
   the answer. It is a copy taken at write time (stale after a
   reassignment), and reusing it would make an alert's visibility depend
   on which ingestion path produced the reading — a future adapter that
   forgets to stamp would silently reintroduce this exact finding.
2. Rows the backfill cannot resolve are **reported, never guessed**. An
   alert filed with the wrong branch shows one branch another branch's
   driving.

**Tests** — `tests/security/telematics-alert-org-unit.spec.ts` (15):
resolution from the vehicle, fail-closed on unassigned/missing/errored
lookups, per-tenant memo keying, TTL expiry picking up a reassignment,
and the pair that matters — a Harare-scoped caller now **sees** the
Harare alert (the function the defect removed) and still **does not
see** the Bulawayo one.

`reading-alerts.ts`'s header, which documented this finding as open, was
corrected rather than deleted: the N+1 reason the live map avoids the
alert store still stands on its own.

---

## Item 3 · Rate limiting

**Two defects, not one.**

1. The counter was a module-level `Map` — per serverless instance, reset
   on cold start.
2. **The key was attacker-chosen.** Every call site used
   `x-forwarded-for.split(',')[0]` — the *leftmost* entry, which is
   whatever the client sent. A caller varying that header lands in a
   fresh bucket every request, so even a perfect store would have
   counted nothing.

**What was done.**

* New `infrastructure/security/rate-limit-store.ts`: a `RateLimitStore`
  interface with a Redis and an in-memory implementation. Redis keeps the
  **same sliding-window-log semantics** (a ZSET) rather than switching to
  a cheaper fixed window — a fixed window lets 2× the limit through
  across a boundary, and changing what "100 per minute" means while
  claiming to fix the limiter is not a fix. Trim, count, decide and
  record are **one atomic `EVAL`**; two commands would reintroduce the
  race being fixed.
* Reuses the **existing** Redis connection via a new
  `getSharedRedisClient()` export on `cache.service.ts`. A second
  connection manager would mean two answers to "is Redis up" and a second
  copy of failure handling that took a production incident to get right.
* In-memory selected when `REDIS_URL` is absent, and **unconditionally
  under `NODE_ENV=test`** so a stray `REDIS_URL` in a developer's shell
  cannot change what the suite asserts. Bounded at 50 000 keys.
* New `infrastructure/security/client-ip.ts`: one trusted-proxy-aware
  resolver, replacing **six** copies of the naive line. Reads
  `X-Forwarded-For` from the **right**, counting `TRUSTED_PROXY_HOPS`
  (default 1); prefers `x-vercel-forwarded-for` / `x-real-ip` when
  `process.env.VERCEL` is set — "use the platform's existing proxy
  handling if present" — and an operator-declared
  `TRUSTED_CLIENT_IP_HEADER` above both. Off a detected platform, no
  forwarded header is trusted by default, because trust is a property of
  the deployment, not of the request. Values are validated as real IPs so
  a 4 KB forged header cannot become a 4 KB Redis key.
* `checkLimit` is now **async** at all six call sites. No synchronous
  variant is kept — leaving one would let a caller silently opt back into
  per-instance limiting with no visible difference at the call site.
* `Retry-After` added to the 429, derived from the oldest surviving
  entry, so a polling client is not told to wait a fresh window on every
  rejected retry.

**Fail-open, stated.** When Redis is unreachable the limiter degrades to
the in-memory window — still a limit, not "allowed". Failing closed would
convert a cache outage into a total outage. The consequence during an
outage is `limit × instance count`; `store: 'memory'` on every result
makes the degradation visible.

**Beyond the brief, flagged not smuggled.** The same naive line also fed
`auth-context.ts` (the IP recorded on a session), `token.controller.ts`
and `oauth-client.controller.ts` (audit records). Those were fixed too:
an audit trail attributing actions to a forged IP is worse than one with
no IP, because it looks like evidence. Those sites keep `undefined` for
an unattributable request rather than a literal `'unknown'` that later
reads as a value.

**Tests** — `tests/security/rate-limit-distributed.spec.ts` (20):
right-hand-end extraction, multi-hop, a chain shorter than the hop count
refusing to attribute, platform-header preference *only* when the
platform is detected, junk rejection, and — the headline — a client
forging a different leftmost entry on every request now hits the limit
after 5 of 6. Redis: two store instances sharing one budget (the
per-instance defect), exactly one round trip per check, and both failure
paths (no client, command throws) degrading to the local window while
still refusing over-limit requests.

---

## Item 4 · Query cache

**Three defects, not one.** The finding recorded two; reading the code
turned up a third that makes the first worse.

1. **Keyed by tenant.** `dashboard:${tenantId}:kpis` says nothing about
   which org units the caller may see.
2. **Populated org-wide.** The only writer is
   `analytics-refresh.worker.ts`, which calls `getFleetKPIs` with **no**
   `TenantContext` — deliberately, since a warm job has no caller. So the
   cached value is the org-wide figure, and combined with (1) the first
   scoped read path wired to this cache would have served every branch
   manager the whole organization's numbers.
3. **Invalidation never matched its own keys.** `cacheService.set`
   prefixes with `cache:`; `deletePattern` passed patterns through
   **unprefixed**. Every invalidation in `AnalyticsHandler` has always
   been a no-op.

**The decision: build (a), default to (b).** Doing only (a) turns caching
on for live financial figures in the change that fixes the caching; doing
only (b) leaves the next person to re-derive a safe key format under
deadline. So:

* Every populated key **requires** a `CacheScope`, constructible only
  from a `TenantContext` (`cacheScopeFor`) or by explicitly declaring an
  org-wide computation (`orgWideCacheScope`). The accessible-unit set is
  sorted, de-duplicated and hashed into the key. Forgetting the scope is
  a compile error, not a leak.
* `tenantId` stays in the **second** segment so every existing
  invalidation pattern keeps matching; putting the scope first would have
  silently orphaned all of them.
* An **empty** accessible set gets its own fingerprint rather than being
  folded into org-wide — the `unassigned@` control account must see
  nothing, and must not share a key with anyone.
* A `variant` dimension separates date ranges: the warm job caches the
  no-range figure, and a request asking for last month must not be handed
  it.
* Read-through population is **off** unless `QUERY_CACHE_ENABLED=true`,
  and when off `getOrFetch` is a plain call to the fetcher — a disabled
  cache is indistinguishable from no cache, or "turn it off" is not a
  real mitigation. Reasoning is in the file header and in
  `BACKLOG_REMAINING.md` §A-5.
* Defect (3) is fixed **unconditionally**: a cache whose invalidation
  does not work becomes dangerous the moment anyone turns reads on.
  Invalidation is deliberately scope-blind (the wildcard sits where the
  fingerprint is), because a writer cannot know which accessible-unit
  combinations cached a row it touched.

**Tests** — `tests/security/query-cache-scope.spec.ts` (16), running
through the **real** `cacheService` in-memory path: no reuse between
Harare-scoped and Bulawayo-scoped callers, org-wide↔scoped in both
directions, a narrower scope not reusing a wider one, per-tenant
separation with identical unit ids, order-independence, and the
invalidation-prefix regression.

---

## Item 5 · Reports on rollups

**The defect.** Raw fixes expire after `TELEMETRY_RETENTION_DAYS` (90).
Rollups were added alongside and retained for 730 days — and nothing read
them, so a report over last March queried `tbltelematics`, found nothing,
and answered zero. A zero meaning "we deleted it" is indistinguishable
from a zero meaning "it did not move".

**What was done.**

* New `modules/telematics/services/telemetry-window.ts` — pure,
  synchronous, taking `now` and the config explicitly so every boundary
  is exhaustively testable. Decides `raw` / `rollup` / `mixed` /
  `unavailable` for a window.
* **Days are the unit of decision, not instants.** A rollup row *is* a
  UTC day; splitting mid-day would make a day partly raw and partly
  aggregate and count those hours twice. The boundary is
  `dayBucket(now - rawDays) + 1 day`.
* The day **containing** the cutoff goes to the rollup. Its raw fixes are
  partially expired, so reading them raw returns a real-looking partial
  day with no sign that it is partial; the rollup for it was written
  while the data was complete. Every affected result says so.
* New `telemetry-reporting.service.ts` answers "summarise this vehicle
  over this window", reading both stores through their **`*InScope`**
  variants — the recurring trap in this codebase is a filtered list with
  an unfiltered total.
* New `getDailyRollupsInScope` on the repository, half-open on `day`,
  scope predicate spread last. It hits
  `idx_telematics_rollup_tenant_unit_day`, declared in Phase 4 and until
  now with no caller.
* The **existing** aggregate path, `getDailySummaryInScope`, was migrated:
  it now falls back to the day's rollup instead of returning `null`, and
  carries `source: 'raw' | 'rollup'`.
* `tbltelematics_daily_rollup` registered in `module-scope.registry.ts`.

**Marked, never substituted** — the brief's constraint, and the right
one:

* `dataSource` and `granularity` on every result;
* `notices[]` carrying a sentence a UI can show verbatim;
* fields a rollup cannot answer are **omitted**, not zero-filled —
  `totalDuration` is absent on a rollup answer, because "0 hours" for a
  day the vehicle drove 142 km is a wrong number that reads as a real
  one;
* a truncated raw read (>20 000 fixes) says so, because a silent
  undercount in a cost-per-km input is a wrong number nobody questions;
* **detail paths were deliberately not migrated** — history playback and
  the live-map breadcrumb still read raw and still return empty past the
  horizon. `windowPredatesRawRetention()` is exported so they can *say*
  why without changing what they return.

**Tests** — `telemetry-rollup-reporting.spec.ts` (18) and
`telemetry-daily-summary-rollup.spec.ts` (6): inside-window raw,
outside-window rollup, the straddling case with the two reads proven not
to overlap, both boundary cases (a window ending exactly on the boundary
is all rollup; starting exactly on it is all raw), beyond both horizons
reporting `unavailable`, rollup-horizon truncation, retention disabled,
an empty window, and org-unit isolation on the new rollup read.

---

## Item 6 · Attention dispatch, fully wired

**What was missing.** The dispatch *decision* and its idempotency key
were built and tested; no repository implemented `DispatchDeps`, no
trigger point existed, and the executors were unregistered — so the
service refused every dispatch with "No executor registered", correctly,
and nothing ever called it.

**What was done.**

* `modules/attention/repositories/attention-dispatch.repository.ts`
  implements `DispatchDeps` on `tblattention_dispatches`, using the
  indexes declared in Phase 4. A plain `insertOne`, **not** an upsert:
  the service reads `code === 11000` to turn a lost race into a
  `duplicate`, and an upsert would silently succeed and let the caller
  execute the action twice. `findDispatch` is tenant-scoped only — the
  idempotency **probe** must not be narrowed by org unit, or a caller in
  another branch misses an existing dispatch and raises a second work
  order. The operator-facing `listInScope` **is** org-unit scoped.
* `modules/rules/actions/maintenance-actions.ts` registers
  `create_work_order` and `schedule_maintenance` on `RuleActionRegistry`
  — the registry's own doc comment anticipated both by name.
* Trigger: `attention-dispatch.trigger.ts` +
  `POST /api/ai/needs-attention/[id]/dispatch`, gated on
  `WORKORDER_CREATE` **or** `MAINTENANCE_CREATE` — deliberately stricter
  than the `ANALYTICS_VIEW` the sibling `resolve` route uses, because
  reading a finding and creating a work order are different acts.
* Default trigger: **operator-initiated only**. Automatic dispatch needs
  `ATTENTION_AUTO_DISPATCH_ENABLED=true` **and** severity ≥ `high` — both
  conditions, not either. The flag refuses an ambiguous value (`1`,
  `yes`) rather than interpreting it: a switch deciding whether software
  creates work by itself must not be read wrong in either direction.
* Fail-closed preserved throughout: unregistered executor → `refused`
  with **nothing recorded**; item outside the caller's scope → 404 (never
  403, so it cannot confirm another branch's findings exist); item with
  no resolvable owner → refused; already-resolved item → `no_action`.

**Three defects found while wiring, each fixed rather than shipped
around.**

1. **The executors would have stayed unregistered on the HTTP path.**
   `registerMaintenanceRuleActions()` runs at module scope in
   `rule-engine.service.ts`, which a dispatch request never loads. The
   registry would have been empty, `isRegistered` false, and every
   dispatch refused — looking exactly like correct behaviour. The trigger
   module now registers both sets itself; a dedicated spec pins it.
2. **`create_work_order` would have duplicated its own source.** The
   `maintenance` attention source includes **open work orders**, and
   `actionForSource` maps that source to `create_work_order` — so a
   dispatch would create a work order for a work order, every refresh
   cycle. The executor now refuses when the target id is itself a work
   order.
3. **The identity trap the audit named.** `entityId` is a vehicle `_id`
   for some sources and a reminder's or work order's `_id` for others,
   while both create DTOs are keyed on `license_plate`. An id passed
   where a plate belongs compiles, validates, and creates work against a
   vehicle that does not exist. Both executors resolve through
   `vehicleIdentityResolver` and **refuse** on an ambiguous plate rather
   than picking one.

Also: `schedule_maintenance` never schedules for *today* — a reminder due
immediately is overdue on the next refresh, which puts it back into the
feed at critical severity, a loop where the platform escalates its own
output. And `estimated_cost` is omitted, not zeroed, when the source had
none: a 0 reads as "free" and feeds the maintenance forecast.

**Tests** — `attention-dispatch-wiring.spec.ts` (23),
`rule-action-maintenance-executors.spec.ts` (16),
`attention-dispatch-executor-registration.spec.ts` (2): the decision, the
default being off, record-before-execute ordering, the item's own org
unit carried into the action, idempotency via both the pre-read and a
simulated 11000, and every refusal path.

---

## Item 7 · AI services evidence envelope

**The defect.** `ai-evidence.types.ts` defined the envelope and
`assertEvidence` to guard it, and not one service emitted it — so every
`confidence: 0.83` in the product was unfalsifiable, and item 6 now lets
those numbers raise real work orders.

**The failure mode avoided.** P6-N2 named it: "evidence arrays that
technically satisfy the guard while pointing at nothing useful — worse
than none, because it looks audited." So there is **one** builder
(`modules/ai/services/ai-evidence.builders.ts`), not seven local loops,
and it enforces what the type only documented: a `reference` must be an
id that resolves to a stored record. A row with no usable id contributes
**nothing** rather than an entry pointing at `'unknown'`.

**What each service now cites.**

| Service | Evidence | Why those rows |
|---|---|---|
| `fuel_fraud` | `tblfuellogs` + `tblvehicles` | The logs *are* the computation; the baseline is per-vehicle, so the vehicle is an input, not just the subject |
| `expense_anomaly` | the one `tblexpenses` row | Every anomaly is a comparison of *this* expense against a baseline; the baseline is a distribution, not a fetchable record |
| `predictive_maintenance` | `tblreminders`, the latest `tbltelematics` reading, `tblvehicles`, `tbltrips` | Ordered by what drives `calculateComponentHealth`. Fuel logs omitted — they reach the prediction only as a scalar |
| `driver_risk` | `tbltelematics` (newest first) + `tbltrips` | The speeding / hard-brake counts come entirely from those readings; a driver disputing the score needs them |
| `fleet_health` | `tblvehicles` + `tblreminders` | The two inputs carrying ~90 % of the weight. Expenses/trips/fuel omitted rather than padding the sample |
| `needs_attention` | **forwarded**, never re-derived | Re-reading would give the feed a second, silently divergent answer to "what did you look at" |
| `intelligence` anomalies | the two `tblfuellogs` rows compared; the spike month's `tblexpenses` | Exactly the rows the figure was computed *from*, not the whole history |

* Added as an **optional** `evidence?: AIEvidence[]` (`WithAIEvidence`)
  rather than by switching to `AIConfidenceEnvelope`: the `confidence`
  numbers already agree platform-wide (P6-N1), so replacing the shape
  would break every consumer for no gain.
* **Persisted** on `AttentionItem` (and on `Anomaly`), because item 6
  lets an item raise a work order and "why did the platform create this
  job?" cannot be answered from a value that existed only in the live
  feed at the moment of dispatch. Written as `null`, never `[]` — an
  empty array reads as "we checked and found nothing", a different claim.
* Capped at 20, ordered deterministically, de-duplicated across sources
  so a row read through two paths does not make the sample look broader
  than it is. See `BACKLOG_REMAINING.md` §B-1.

**Tests** — `ai-evidence-emission.spec.ts` (17) and
`ai-evidence-services.spec.ts` (8). Beyond non-emptiness: every
reference is asserted to be one of the ids fed in, placeholders are
rejected, an `_id` that stringifies to `[object Object]` is refused, the
sample is proven reproducible under reordered input, and the two
legitimate omissions (empty fleet, driver with no data) are asserted to
be **absent** rather than `[]`.

---

## Files

**New (12)**

```
infrastructure/security/client-ip.ts
infrastructure/security/rate-limit-store.ts
modules/ai/services/ai-evidence.builders.ts
modules/attention/repositories/attention-dispatch.repository.ts
modules/attention/services/attention-dispatch.config.ts
modules/attention/services/attention-dispatch.trigger.ts
modules/rules/actions/maintenance-actions.ts
modules/telematics/services/alert-ownership.resolver.ts
modules/telematics/services/telemetry-reporting.service.ts
modules/telematics/services/telemetry-window.ts
scripts/backfill-alert-org-units.ts
app/api/ai/needs-attention/[id]/dispatch/route.ts
```

**Modified (33)**

```
app/api/auth/precheck/route.ts
app/api/auth/sso/discover/route.ts
app/api/organizations/[id]/logo/route.ts
infrastructure/cache/cache.service.ts
infrastructure/cache/query-cache.service.ts
infrastructure/security/rate-limit.ts
infrastructure/security/rate-limit-advanced.ts
modules/ai/controllers/ai.controller.ts
modules/ai/services/driver-risk.service.ts
modules/ai/services/expense-anomaly-detection.service.ts
modules/ai/services/fleet-health.service.ts
modules/ai/services/fuel-fraud-detection.service.ts
modules/ai/services/needs-attention.service.ts
modules/ai/services/predictive-maintenance.service.ts
modules/ai/types/ai.types.ts
modules/ai/types/needs-attention.types.ts
modules/attention/repositories/attention-item.repository.ts
modules/attention/services/attention-dispatch.service.ts
modules/attention/types/attention-item.types.ts
modules/intelligence/services/anomaly-detection.service.ts
modules/oauth/controllers/oauth-client.controller.ts
modules/rules/services/rule-engine.service.ts
modules/security/controllers/token.controller.ts
modules/telematics/repositories/telematics.repository.ts
modules/telematics/services/reading-alerts.ts
modules/telematics/services/telematics.service.ts
modules/telematics/types/telematics.tenancy-addendum.ts
package.json
server/auth/auth-context.ts
server/middleware/with-auth.ts
server/tenancy/module-scope.registry.ts
shared/types/anomaly.types.ts
workers/analytics-refresh.worker.ts
```

**New tests (10)** — all under `tests/security/`

```
ai-evidence-emission.spec.ts
ai-evidence-services.spec.ts
attention-dispatch-executor-registration.spec.ts
attention-dispatch-wiring.spec.ts
query-cache-scope.spec.ts
rate-limit-distributed.spec.ts
rule-action-maintenance-executors.spec.ts
telematics-alert-org-unit.spec.ts
telemetry-daily-summary-rollup.spec.ts
telemetry-rollup-reporting.spec.ts
```

**No existing test was weakened or deleted.** One pre-existing suite,
`attention-dispatch-and-evidence.spec.ts`, still passes unchanged. Two
adjustments were made **inside the new suites** while writing them, both
because my first expectation was wrong rather than the code:

* the dispatch config accepts `'TRUE '` and `' true '` (trimmed,
  case-insensitive) — refusing those would be pedantry that costs a
  deployment, not a safety property; `1`, `yes`, `on` and `Trues` are
  still refused;
* the `RuleActionRegistry` test double in `attention-dispatch-wiring`
  gained a `register` method, because the trigger now registers
  executors at import time. The real behaviour is asserted separately in
  `attention-dispatch-executor-registration.spec.ts`.

---

## Manual steps

Ordered. Steps 1–2 are required before the corresponding feature works
correctly on existing data; 3–5 are configuration.

1. **`npm run db:indexes`** — creates
   `uniq_attention_dispatch_tenant_idempotency`. Without it the dispatch
   idempotency guarantee is application-level only and a genuine race can
   slip through.
2. **`npm run db:backfill-alert-orgunits`** — dry run first, then
   `-- --confirm`. Historical alerts stay invisible to scoped readers
   until this runs. Revert with `-- --revert <runId> --confirm`.
3. **`TRUSTED_PROXY_HOPS`** — leave unset (1) for Vercel / Fly / single
   nginx; set `2` if a CDN sits in front. Or name an unspoofable
   single-valued header in `TRUSTED_CLIENT_IP_HEADER`.
4. **`REDIS_URL`** — required for the rate limit to be shared across
   instances. Absent, it is per-instance and says so.
5. **Optional, both default off:** `QUERY_CACHE_ENABLED=true` (read
   `BACKLOG_REMAINING.md` §A-5 first) and
   `ATTENTION_AUTO_DISPATCH_ENABLED=true` (§A-2).

Nothing in this pass requires a redeploy ordering beyond the usual: the
code is backward-compatible with un-backfilled rows in both directions.
