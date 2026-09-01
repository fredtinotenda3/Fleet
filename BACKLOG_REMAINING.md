# Backlog — what is still open after this pass

Recorded rather than pretended-done, in the same style as
`PHASE_*_REMAINING_FINDINGS.md` and `HARDENING_REMAINING.md`.

Items 2–7 of the backlog are implemented. Everything below is either a
deliberate limit of that implementation, a decision that needs a human,
or infrastructure this codebase cannot provision for you.

---

## A. Needs a decision or an action from you

### A-1 · `npm run db:backfill-alert-orgunits` has NOT been run
**Item 2 · Manual step · Blocking for historical alerts**

The write path is fixed: every alert raised from now on carries the org
unit resolved from its vehicle. Alerts raised **before** this deploy
still have no `orgUnitId` and remain invisible to org-unit-scoped
readers.

There is no database in the authoring environment, so the script has
been **type-checked and never executed**. Run it yourself:

```bash
npm run db:backfill-alert-orgunits                 # dry run, all tenants
npm run db:backfill-alert-orgunits -- --confirm    # commit
npm run db:backfill-alert-orgunits -- --revert <runId> --confirm
```

Rows it will report and deliberately **not** fill:

| Case | Why it is left alone |
|---|---|
| Vehicle no longer exists | Nothing to join to. |
| Vehicle exists with no `orgUnitId` | Assigning the alert would mean inventing an owner for the vehicle. `npm run tenancy:report` lists these. |
| Alert row has no `vehicleId` | No join key at all. |

A guessed owner is worse than an invisible row here: an alert is a claim
about a named vehicle's behaviour, and filing it with the wrong branch
shows one branch another branch's driving.

### A-2 · `ATTENTION_AUTO_DISPATCH_ENABLED` is a product decision
**Item 6 · Default chosen, not imposed**

The shipped default is **operator-initiated dispatch only**. Automatic
dispatch requires `ATTENTION_AUTO_DISPATCH_ENABLED=true` *and* an item
at `high` severity or above.

Whether to ever turn that on is your call, and the reasoning is in
`modules/attention/services/attention-dispatch.config.ts`. The short
version: attention items are recomputed on a schedule from models whose
inputs change, so a scoring bug or a provider outage becomes a queue of
real work orders against real vehicles, discovered by the workshop.

### A-3 · `TRUSTED_PROXY_HOPS` must match your actual topology
**Item 3 · Default is 1**

Client IP is now read from the right-hand end of `X-Forwarded-For`,
counting `TRUSTED_PROXY_HOPS` trusted proxies. The default of **1** is
correct for Vercel, Fly and a single nginx.

If you put a CDN in front of the platform proxy, set `TRUSTED_PROXY_HOPS=2`
or the resolver will attribute requests to the CDN rather than the
client. If you terminate TLS somewhere that publishes a single-valued,
unspoofable header, name it in `TRUSTED_CLIENT_IP_HEADER` and it wins
outright.

Getting this wrong is visible rather than silent: every client collapses
into one rate-limit bucket, or into `unknown`.

### A-4 · Redis is required for the rate limit to be distributed
**Item 3 · Infrastructure**

With `REDIS_URL` set, the limiter is a single shared sliding window
across every instance. Without it, it falls back to the in-memory store,
which is per-instance — the original defect, now at least explicit and
reported (`store: 'memory'` on every result).

The fallback is also what happens when Redis is **unreachable**, and
that is deliberate: a limiter that fails closed converts a cache outage
into a total outage. **The consequence, stated:** during a Redis outage
the effective limit becomes `limit × instance count`.

### A-5 · `QUERY_CACHE_ENABLED` is off, and should stay off for now
**Item 4 · Deliberate**

The scope-keyed machinery is built and tested. Read-through population
is disabled by default because:

* no read path uses it yet, so enabling it would change what live
  endpoints return in a change about the cache's *correctness*;
* without `REDIS_URL`, `cacheService` falls back to a per-process map,
  so invalidation reaches only the instance that performed the write.
  For cost and fuel figures, serving a figure another instance already
  knows is stale is worse than a slow query.

Turn it on when a scoped read path adopts `getOrFetch` **and** a
staleness window has been agreed for that path — and preferably only
with Redis present.

---

## B. Deliberate limits of what was built

### B-1 · Evidence is a capped sample, not the full population
**Item 7**

`MAX_EVIDENCE_REFS` is 20. A driver-risk score computed over 400
readings cites the 20 most recent.

This is the concern P6-N2 raised ("several compute across an aggregation
where the answer is genuinely these 400 readings"), and the compromise
is: the sample is **deterministic** (same inputs cite the same rows, in
the same order), and the population size is already visible on the
payload (`metrics`, `dataPoints`, `anomalies.length`), so a reader can
see that 20 of 400 are cited. Nothing is fabricated to fill the gap.

### B-2 · Two services cite nothing, on purpose

| Service | Why |
|---|---|
| `fleet_health` **recommendations** | A recommendation spans zero or more vehicles with no single owning entity — the same reason `AttentionOwnershipResolver` returns null for them and `actionForSource` refuses to dispatch them. The *score* does emit evidence (the vehicles scored and their maintenance records); the individual recommendations do not. |
| Any service with **no rows to read** | A driver with no trips and no telemetry, or an empty fleet, gets `evidence` **omitted** rather than `[]`. An empty array reads as "we checked and found nothing"; absent says "there was nothing to look at". |

Nothing else in the seven declines to emit evidence.

### B-3 · Reporting rollups: the retention boundary is a heuristic
**Item 5**

The TTL is on `createdAt`, not `timestamp` — correct, and documented in
`telemetry-retention.config.ts` — which means "older than the retention
window" is a statement about *likely* availability, not a guarantee of
absence. A month of history backfilled yesterday still has raw rows.

The planner routes old windows to rollups and records the caveat rather
than reading both stores and adding them, which would double-count
exactly the backfilled days it was trying to rescue.

Related, and inherited from P4-N3: **rollups accrue forward from the
first nightly run.** Days before that have no rollup row, so an
out-of-retention window over them still returns nothing — correctly
reported as `rollupDays: 0` rather than a confident zero.

### B-4 · The day containing the retention cutoff is served from the rollup
**Item 5 · Behaviour change worth knowing**

That day's raw fixes are partially expired, so reading them raw would
return a real-looking partial day. The rollup for it was written while
the data was complete. Every affected result carries a notice saying so.

### B-5 · A failed dispatch leaves a record that blocks a retry
**Item 6**

`AttentionDispatchService` records the dispatch **before** executing, so
a redelivery cannot create a second work order. The consequence is that
an executor failure (unresolvable vehicle, ambiguous plate) leaves a
record with no work behind it, and a retry then returns `duplicate`.

That is the right way round, and it is not silent: the failure is
written onto the record (`failedAt` / `failureReason`), returned as
`action_failed` with the reason, and an operator who fixes the
underlying data can see exactly which record to clear. **There is no
"clear and retry" endpoint yet** — that is a small follow-up, recorded
here rather than bolted on.

### B-6 · Importing the dispatch trigger pulls in the workflow and notification modules
**Item 6 · Trade-off**

`attention-dispatch.trigger.ts` calls `registerDefaultRuleActions()` and
`registerMaintenanceRuleActions()` at module scope. Without that, the
registry is empty on the HTTP dispatch path (which never loads the rule
engine) and every dispatch refuses with "No executor registered" — the
exact silent inertness this item was meant to fix, and it looks like
correct behaviour, which is what makes it dangerous.
`attention-dispatch-executor-registration.spec.ts` pins it.

The cost is a larger module graph on `/api/ai/*` cold starts. This
mirrors `ai.controller.ts`'s module-scope `bootstrapCqrs()`, which
exists for the identical reason.

### B-7 · The dispatch idempotency guarantee needs the index
**Item 6 · Operational**

`recordDispatch` uses a plain `insertOne` and lets a duplicate-key error
propagate, because the service reads `code === 11000` to turn a lost
race into a `duplicate`. The uniqueness itself is the index's job:

```bash
npm run db:indexes     # creates uniq_attention_dispatch_tenant_idempotency
```

Without it, the application-level pre-read still collapses the common
case; only a genuine race can slip through.

---

## C. Not attempted, and why

### C-1 · Detail read paths were not migrated to rollups
**Item 5 · Per the brief**

`getTelematicsHistoryInScope` (history playback, the live-map
breadcrumb) still reads raw and still returns an empty list past the
horizon. The brief is explicit and correct: silently serving aggregates
where a report promised detail is worse than an empty result.
`windowPredatesRawRetention()` is exported so those paths can *say* why
they are empty without changing what they return; wiring it into the UI
is a frontend change and is not part of this pass.

### C-2 · The AI services' `confidence` numbers were not re-derived
**Item 7 · Out of scope, deliberately**

Evidence records *what the score rested on*. It does not make the
scoring formulas better, and several of them are still weighted
heuristics. Changing a scorer is a behaviour change to intelligence
output and belongs in its own pass — the point of the evidence envelope
is that such a change becomes reviewable.

### C-3 · No test against a real MongoDB
**All items · Inherited gap**

Unchanged from previous phases. The rollup read, the dispatch unique
index and the alert backfill are asserted structurally and against
in-memory doubles. `mongodb-memory-server` downloads a mongod from a
blocked host in this environment. See `HARDENING_REMAINING.md` §1 for
how to run the integration suite yourself.

### C-4 · Pre-existing items untouched by this pass

Carried forward unchanged from `HARDENING_REMAINING.md`:

| ID | Finding | Status |
|---|---|---|
| F-17 | Live map is a poll presented as real-time | Backend honest (`dataStale`); item 8 handled the UI separately |
| — | `npm run lint` fails with 23 pre-existing errors | Non-blocking in CI, not fixed |
| — | `OBSERVABILITY_VIEW` permission still unmerged; route borrows `JOB_VIEW` | Not fixed |
| — | `next/font` fetches Geist from Google at build time | Pre-existing; blocks air-gapped builds |
| — | E2E is API-contract level, not over HTTP | Unchanged |
