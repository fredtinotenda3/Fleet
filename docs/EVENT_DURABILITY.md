# Event Durability

How domain events survive a crash, and where the processor runs.

```
publish()  ──►  tbloutbox_events  (durable, status: pending)
                       │
                       ▼
              OutboxProcessor      claims with a lease, atomically
                       │
                       ▼
              InMemoryEventBus     the handlers bootstrap registered
                       │
                       ▼
                   Handlers        workflow, notification, analytics,
                                   intelligence, projections, webhooks…
```

**The rule:** publication writes a row and returns. All dispatch happens
in the processor.

---

## What changed

`EventBusFactory.getInstance()` returned `new InMemoryEventBus()`
**unconditionally**. Every domain event — telemetry ingestion, workflow
triggers, AI predictions, digital-twin projections, audit records,
webhook dispatch — was delivered in-process, best-effort, and lost on
crash, redeploy or serverless instance recycle.

The transactional outbox next door was described as complete and dead. It
was worse than dead — it was **un-enableable**:

| Defect | Consequence |
|---|---|
| `OutboxPublisher` held `EventBusFactory.getInstance()` as a field initialiser | Making the factory return it would recurse until the stack blew, on first publish |
| `OutboxProcessor` called `getUnprocessedEvents('default', …)` | `'default'` is a Phase 0 fail-closed sentinel — the first poll **threw** |
| No claim | Two processors read the same rows and both dispatched |
| No backoff | A failing row retried every poll, forever |
| No terminal state | A poisoned event retried until the end of time |
| `tbloutbox_events` had no indexes at all | Every poll a collection scan; no uniqueness on `eventId` |

All six are fixed.

---

## Delivery strategy: write-only

Publication writes the outbox row and **does not dispatch in-process**.

The old code did both — wrote the row *and* published to the in-memory
bus. That is the worst option: once the processor runs it picks up the
same row and dispatches again, so every handler with a side effect fires
**twice for every event**. Two notifications, two webhook deliveries, two
projection writes. Not a rare race — the steady state.

**The cost, stated plainly:** handlers no longer run synchronously with
the request that triggered them. Anything that (incorrectly) depended on
a handler having completed by the time `publish()` resolved will now
observe that work up to one poll interval later. That is a real
behavioural change, and it is why outbox mode is opt-in per environment.

---

## Delivery guarantee: at-least-once

Honestly at-least-once, and the gap is precise: dispatch and the
subsequent `markProcessed` are two operations against two systems. A
processor that crashes between them has run the handlers and not recorded
it, so the lease expires and another processor redelivers.

`isAlreadyProcessed(eventId)` is checked **before** dispatch, so it
catches redelivery of a row that was fully completed — not a crash
mid-dispatch. Closing that window entirely would need each handler's
write and the row update in one Mongo transaction, which means every
handler participating in a session it currently knows nothing about. That
is larger than Phase 3; labelling this exactly-once would be worse than
stating the limit.

**Handlers must tolerate being called twice.**

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `EVENT_BUS_MODE` | `outbox` in production, `memory` otherwise | Durable or in-process |
| `OUTBOX_PROCESSOR_ENABLED` | `true` in outbox mode | Run the loop in *this* process |
| `OUTBOX_PROCESSOR_EXTERNAL` | `false` | A processor runs in another process |
| `OUTBOX_PROCESSOR_INTERVAL_MS` | `5000` | Poll interval |
| `OUTBOX_MAX_ATTEMPTS` | `5` | Attempts before dead-letter |
| `OUTBOX_LEASE_TIMEOUT_MS` | `30000` | Claim duration |
| `OUTBOX_BACKOFF_BASE_MS` | `1000` | First retry delay |
| `OUTBOX_BACKOFF_MAX_MS` | `60000` | Backoff ceiling |
| `OUTBOX_BATCH_SIZE` | `100` | Rows claimed per poll |

All read once, in `server/events/outbox/outbox.config.ts`. Nothing else
touches `process.env` for event configuration.

### It refuses contradictory setups

`resolveOutboxConfig()` **throws** — it never falls back — on:

- **Outbox mode with no processor anywhere.** Events would be durably
  recorded and delivered *never*: worse than the in-memory bus it
  replaces, because it also looks healthy while a collection grows. Set
  `OUTBOX_PROCESSOR_ENABLED=true` or `OUTBOX_PROCESSOR_EXTERNAL=true`.
- **`OUTBOX_LEASE_TIMEOUT_MS` ≤ `OUTBOX_PROCESSOR_INTERVAL_MS`.** A claim
  that expires while its owner is still working lets a second processor
  pick the row up mid-flight — at-least-once becomes reliably-twice for
  every slow handler.
- **`OUTBOX_BACKOFF_MAX_MS` < `OUTBOX_BACKOFF_BASE_MS`.**
- **Any non-numeric or out-of-range value.** A typo'd
  `OUTBOX_MAX_ATTEMPTS=O` would otherwise become the default silently.

Production defaults to `outbox` because the alternative default is silent
event loss, and a default that loses data is not a safe default.

---

## Deployment topology

The outbox is only durable if something drains it. `workers/bootstrap.ts`
no-ops without `REDIS_URL`, and the documented target is Vercel, which has
no long-lived process — so this decision is not automatic.

**A. Dedicated worker (recommended).** `startOutboxProcessor()` is called
from `workers/bootstrap.ts`, after the `REDIS_URL` guard, so it runs in
the one process guaranteed to be long-lived.

```
EVENT_BUS_MODE=outbox
OUTBOX_PROCESSOR_ENABLED=true
```

**B. External scheduler.** A cron calls `npm run events:process`; it
drains once and exits non-zero if anything dead-lettered.

```
EVENT_BUS_MODE=outbox
OUTBOX_PROCESSOR_ENABLED=false
OUTBOX_PROCESSOR_EXTERNAL=true
```

**C. Memory mode.** `EVENT_BUS_MODE=memory`. Pre-Phase-3 behaviour —
events lost on crash — now an explicit choice rather than the only option.

**Not supported:** the processor inside the Next.js web process on
serverless. `startOutboxProcessor()` detects `VERCEL` /
`AWS_LAMBDA_FUNCTION_NAME` and **refuses**, logging the remedy, rather
than starting something that looks configured and delivers unreliably.

```bash
npm run events:process   # drain once
npm run events:worker    # poll continuously
```

Both call `bootstrapEvents()` first. Without it the processor would claim
rows, dispatch into a bus with no subscribers, and mark them processed —
delivering every event to nobody while reporting success.

---

## Retry and dead-letter

| Status | Meaning |
|---|---|
| `pending` | Awaiting dispatch, now or at `nextAttemptAt` |
| `processing` | Claimed; lease held until `leaseExpiresAt` |
| `processed` | Delivered; terminal |
| `dead_letter` | Exceeded `maxAttempts`; terminal, needs a human |

Backoff doubles: 1s, 2s, 4s, 8s… capped at `OUTBOX_BACKOFF_MAX_MS`.
Without it, a handler failing because a downstream service is down is
retried every poll — turning one outage into a self-inflicted load test
against the thing already struggling.

Both terminal states are terminal **by design**. Nothing automatically
resurrects a dead letter: a duplicate side effect appearing months later
with no human in the loop is worse than an undelivered event. Requeue
explicitly via `outboxRepository.requeueDeadLetter(eventId, tenantId)`.

A `processing` row whose lease has passed is reclaimable — that is the
crash-recovery path, and it is why a dead processor cannot strand an
event.

---

## Handler failure must reach the processor

`InMemoryEventBus.publish()` **never rejects**, by deliberate design,
against a real incident: it is called fire-and-forget after a database
write, where a throw reported a successful operation as failed (every row
of a bulk import).

That reasoning does not extend to the processor, whose entire job is to
know whether delivery succeeded. Dispatching through `publish()` would
swallow every handler failure, mark the row processed, and make retry,
backoff and dead-letter **unreachable** — an expensive no-op that loses
precisely the events it was built to protect.

So the processor uses **`publishOrThrow()`**: individual handlers stay
isolated (one bad handler does not stop its siblings), but the aggregate
outcome is reported rather than absorbed. `publish()` is unchanged for
every existing caller.

---

## Tenancy

The processor is a **platform-level** job, like the schedulers in
`server/scheduler/`. It claims across tenants because it is the delivery
mechanism for all of them — a tenant id would be a lie in either
direction: a single tenant silently stops delivering for everyone else,
and a sentinel throws (which is what `'default'` did).

Isolation is preserved where it belongs: every row carries its own
`tenantId`, the event is rehydrated with that tenant in its metadata, and
handlers resolve their own scope from it exactly as for a live event.
**The processor moves envelopes; it never reads a tenant's domain data.**

Per-tenant reads (an admin viewing their own dead-letter queue) go
through the tenant-scoped base repository like any other read.

Outbox rows store the event payload. Failure messages are truncated to
500 characters and payloads are never logged — a handler failure can
carry a vendor response body or a stack trace containing payload values.

---

## Indexes

`npm run db:indexes` creates them.

| Index | Purpose |
|---|---|
| `uniq_outbox_event_id` (**unique**) | The idempotency key. Collapses a duplicate publish at the database, not via a read-then-write check that could interleave |
| `idx_outbox_status_next_created` | The claim query. Without it every poll is a collection scan |
| `idx_outbox_status_lease` | Stale-lease recovery |
| `idx_outbox_processed_at` | The existing cleanup job |
| `idx_outbox_tenant_status_deadlettered` | Per-tenant dead-letter queue |

No TTL: it would delete rows a processor might still be retrying.
Retention stays with `workers/cleanup.worker.ts`, which only removes rows
already marked processed. `status` was added alongside the existing
`processed` boolean, which is kept in step so that job works unchanged.

The collection is created by Mongo on first insert; no migration is
required.

---

## Handler idempotency

Handlers may be invoked more than once. Reviewed:

| Handler | Duplicate-safe? | Why |
|---|---|---|
| `DigitalTwinProjectionHandler` | Yes | Recomputes from current state; idempotent by construction |
| `AnalyticsHandler` | Yes | Cache invalidation only |
| `PermissionCacheInvalidationHandler` | Yes | Invalidation only |
| `AuditHandler` / `SecurityAuditHandler` | Yes | `tblauditlog` has a unique `sequence` index |
| `IntelligenceHandler`, `AIPredictionTriggerHandler` | Yes | Attention items upsert on `{tenantId, itemKey}` |
| `NotificationHandler` | **No** | A duplicate delivery sends a second notification |
| `WebhookDispatchHandler` | **No** | A duplicate delivery posts twice to the subscriber |
| `WorkflowTriggerHandler` | **No** | `startWorkflow` has no dedupe key; a duplicate starts a second instance |

The three non-idempotent handlers are recorded rather than fixed:
`NotificationHandler` and `WebhookDispatchHandler` deliver externally,
where a duplicate is visible but not corrupting; `WorkflowTriggerHandler`
needs an idempotency key on `startWorkflow`, which is Phase 5 (workflow
scoping) territory. The `isAlreadyProcessed` gate makes duplicate
dispatch rare — it happens only on a crash between dispatch and
completion — but it does not make it impossible. See
`PHASE_3_REMAINING_FINDINGS.md`.
