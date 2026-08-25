# Phase 3 — Event Durability

Implemented on top of Phase 0 (security), Phase 1 (telemetry data
integrity) and Phase 2 (provider contract).

## Status

| Item | Result |
|---|---|
| Outbox wired into `EventBusFactory` | **FIXED** |
| `OutboxPublisher` writes before dispatch | **FIXED** |
| `OutboxProcessor` processes events | **FIXED** |
| Retry / backoff / dead-letter | **FIXED** |
| Idempotency | **FIXED** |
| Configuration boundary | **FIXED** |
| Phase 0 regression | **PASSED** |
| Phase 1 regression | **PASSED** |
| Phase 2 regression | **PASSED** |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1094 passed / 1094, 67 suites** |
| Baseline 1028 / 63 | **+66 tests, 0 regressions** |
| Phase 0+1+2 regression (13 suites) | **260 passed / 260** |
| New Phase 3 suites | 20 + 19 + 16 + 11 = **66 passed** |

---

## What was actually wrong

The audit described the outbox as "complete, correct, and dead". It was
worse: **un-enableable**. Six defects, any one fatal.

| Defect | Consequence |
|---|---|
| `OutboxPublisher` held `EventBusFactory.getInstance()` as a field initialiser | Making the factory return it would recurse until the stack blew, on first publish |
| `OutboxProcessor` called `getUnprocessedEvents('default', …)` | `'default'` is a Phase 0 fail-closed sentinel — the first poll **threw** |
| No claim mechanism | Two processors read the same rows and both dispatched |
| No backoff | A failing row retried every poll, forever |
| No terminal state | A poisoned event retried indefinitely |
| `tbloutbox_events` had **no indexes at all** | Every poll a collection scan; no uniqueness on `eventId` |

All six are fixed.

---

## Delivery strategy: write-only

Publication writes the outbox row and **does not dispatch in-process**.

The old code did both. Once the processor runs it picks up the same row
and dispatches again — so every handler with a side effect fires **twice
for every event**. Two notifications, two webhook deliveries, two
projection writes. Not a rare race; the steady state.

**The cost, stated plainly:** handlers no longer run synchronously with
the request that triggered them. Anything that (incorrectly) depended on
a handler completing by the time `publish()` resolved now sees that work
up to one poll interval later. That is why outbox mode is opt-in per
environment rather than switched on globally.

**Guarantee: at-least-once**, honestly. Dispatch and `markProcessed` are
two operations against two systems; a crash between them means
redelivery. `isAlreadyProcessed` is checked *before* dispatch so it
catches redelivery of a completed row, not a crash mid-dispatch. Closing
that window needs every handler in a Mongo transaction — larger than
Phase 3, and calling this exactly-once would be worse than stating the
limit.

---

## The finding that changed the design

`InMemoryEventBus.publish()` **never rejects** — deliberately, against a
documented incident where a fire-and-forget publish after a DB write made
every row of a bulk import report as failed.

Correct for those callers. **Catastrophic for the processor**, whose
entire job is knowing whether delivery succeeded: dispatching through
`publish()` would swallow every handler failure, mark failed events
processed, and make retry, backoff and dead-letter **unreachable** — an
expensive no-op that loses precisely the events it exists to protect.

Found because an end-to-end test that *should* have shown a retry showed
a success. Fixed with `publishOrThrow()` for the processor; `publish()`
is byte-identical for all existing callers. Handlers stay isolated (one
bad handler does not stop its siblings) but the aggregate outcome is
reported.

---

## Configuration and topology

Config is read once, in `server/events/outbox/outbox.config.ts`, and
**refuses** contradictory setups rather than falling back:

- **Outbox mode with no processor anywhere** → throws. Events would be
  durably recorded and delivered *never* — worse than the in-memory bus,
  because it also looks healthy while a collection grows.
- **Lease ≤ poll interval** → throws. A claim expiring while its owner
  works turns at-least-once into reliably-twice for every slow handler.
- **Any non-numeric or out-of-range value** → throws.

Production defaults to `outbox`, because the alternative default is
silent event loss.

**Topology** (`docs/EVENT_DURABILITY.md` has the full matrix):

- **A. Dedicated worker (recommended)** — `startOutboxProcessor()` runs
  from `workers/bootstrap.ts`, after the `REDIS_URL` guard, in the one
  process guaranteed to be long-lived.
- **B. External scheduler** — `npm run events:process` drains once, exits
  non-zero if anything dead-lettered. Set `OUTBOX_PROCESSOR_EXTERNAL=true`.
- **C. Memory mode** — pre-Phase-3 behaviour, now an explicit choice.

**Refused:** the processor inside the web process on serverless.
`startOutboxProcessor()` detects `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME`
and declines with the remedy logged, rather than starting something that
looks configured and delivers unreliably.

---

## Files

**New (10)**
```
server/events/outbox/outbox.config.ts        config boundary; fail-closed
server/events/outbox/OutboxEventBus.ts       IEventBus wrapper (keeps 131 call sites)
server/events/outbox/StoredDomainEvent.ts    rehydration preserving eventId + occurredOn
server/events/outbox/outbox-runner.ts        start/stop/drain + topology guard
scripts/process-outbox.ts                    events:process / events:worker
infrastructure/database/indexes.outbox-addendum.ts   5 indexes
docs/EVENT_DURABILITY.md                     architecture + deployment
tests/unit/events/outbox-config-and-factory.spec.ts       20 tests
tests/unit/events/outbox-processor.spec.ts                19 tests
tests/unit/events/outbox-publisher-integration.spec.ts    16 tests
tests/security/outbox-indexes.spec.ts                     11 tests
```

**Modified (7)**
```
server/events/bus/EventBusFactory.ts    mode selection; lazy load breaks an import cycle
server/events/bus/InMemoryEventBus.ts   + publishOrThrow(); publish() untouched
server/events/outbox/OutboxEvent.ts     + status, lease, nextAttemptAt, dead-letter
server/events/outbox/OutboxRepository.ts  atomic claim, backoff, dead-letter, requeue
server/events/outbox/OutboxPublisher.ts   write-only; recursion removed
server/events/outbox/OutboxProcessor.ts   lease, backoff, dead-letter, idempotency gate
workers/bootstrap.ts                    starts the processor
infrastructure/database/indexes.ts      merges OUTBOX_INDEXES
package.json                            + events:process, events:worker
```

---

## Manual steps

1. `npm ci`
2. `npm run db:indexes` — creates the five outbox indexes. **Required
   before enabling outbox mode:** without `uniq_outbox_event_id` a
   duplicate publish silently produces two rows.
3. Choose a topology and set the env vars (see above). The app **refuses
   to start** in outbox mode without one, by design.
4. Deploy the worker process, or schedule `npm run events:process`.

No migration and no backfill. `tbloutbox_events` is created by Mongo on
first insert; nothing wrote to it before, so there is nothing to convert.
Existing Phase 1/2 steps (`db:dedupe-telemetry`,
`db:backfill-device-provider`) are unaffected and still required if not
yet run.

**Backward compatibility:** `InMemoryEventBus` is retained and is still
the default outside production. All 131 `EventBusFactory.getInstance()`
call sites and `bootstrap.ts`'s handler registration are unchanged — the
outbox is composed *into* an `IEventBus` rather than replacing it. No
public event interface changed.

---

## Remaining — outside Phase 3

`PHASE_3_REMAINING_FINDINGS.md` records four new findings and the audit
items Phase 3 does not touch. The ones worth naming here:

- **Three handlers are not idempotent** — `NotificationHandler`,
  `WebhookDispatchHandler`, `WorkflowTriggerHandler`. Documented rather
  than fixed; the workflow one needs an idempotency key on
  `startWorkflow`, which is Phase 5.
- **No operational surface** — `countByStatus()` and
  `getDeadLetteredForTenant()` exist but nothing exposes them. Phase 7.
- **No test against a real MongoDB.** The suites use in-memory doubles
  implementing the same lifecycle contract. They prove the processor's
  logic; they do **not** prove `findOneAndUpdate` is atomic under real
  concurrency, because the fake serialises everything. That is a property
  of MongoDB and of the unique index, asserted structurally instead.
  Stated in the suite headers, not left to be inferred.
