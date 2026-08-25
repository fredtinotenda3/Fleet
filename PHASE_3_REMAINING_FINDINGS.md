# Findings outside Phase 3

Recorded during Phase 3 and **deliberately not implemented**, per the
change-discipline rule.

---

## Found during Phase 3

### P3-N1 · Three handlers are not idempotent
**Severity: MEDIUM · Recorded, not fixed**

At-least-once delivery means a handler can run twice — on a crash between
dispatch and `markProcessed`. Reviewed all registered handlers; three are
not duplicate-safe:

- **`NotificationHandler`** — a duplicate sends a second notification.
- **`WebhookDispatchHandler`** — a duplicate posts twice to the subscriber.
- **`WorkflowTriggerHandler`** — `startWorkflow` has no dedupe key, so a
  duplicate starts a second workflow instance.

Not fixed because each needs a different mechanism, and the workflow one
needs an idempotency key on `startWorkflow` — which is Phase 5
(workflow/rule scoping) territory and was already recorded there as
"neither engine is idempotent".

The `isAlreadyProcessed(eventId)` gate makes duplicate dispatch **rare**
(it only occurs on a crash mid-dispatch, not on ordinary retry), but not
impossible. Documented in `docs/EVENT_DURABILITY.md` rather than hidden.

### P3-N2 · `InMemoryEventBus.publish()` swallows all failures
**Severity: MEDIUM · Worked around, root cause untouched**

`publish()` deliberately never rejects, against a documented incident:
callers invoke it fire-and-forget after a DB write, and a throw reported a
successful operation as failed for every row of a bulk import.

That is correct for those callers and **catastrophic for the processor** —
dispatching through it would swallow every handler failure, mark failed
events processed, and make retry/backoff/dead-letter unreachable.

Phase 3 adds `publishOrThrow()` for the processor and leaves `publish()`
byte-identical. The deeper issue — that fire-and-forget publication hides
handler failures from *everyone*, so a handler can fail silently forever
in memory mode — is unchanged. Fixing it properly means giving those
callers a way to observe failure without failing their own operation,
which is an observability change (Phase 7).

### P3-N3 · Outbox has no operational surface
**Severity: LOW · Not fixed**

`countByStatus()` and `getDeadLetteredForTenant()` exist on the repository
but no route, dashboard or metric exposes them. An operator cannot
currently answer "how many events are stuck?" without a Mongo shell.

Not fixed because it is squarely Phase 7 (observability), which will also
add the provider-health and telematics metrics the audit found missing.
The repository methods are in place so that phase has something to call.

### P3-N4 · Event payloads are stored unencrypted in the outbox
**Severity: LOW · Recorded**

Outbox rows persist the full event payload until the cleanup job removes
them (7 days after processing). Payloads may contain vehicle positions and
driver identifiers — the same data already in `tbltelematics`, at the same
sensitivity, under the same tenant scoping.

Not a new exposure and not fixed here: encrypting payloads at rest would
need key management for a collection the processor must read on every
poll. Worth revisiting if the retention window is ever extended.

---

## Audit findings Phase 3 does not address

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-10 | Multi-currency exists as type declarations only | HIGH |
| F-12 | **No telemetry retention policy** — unbounded growth | HIGH — Phase 4 |
| F-13 | Geofence evaluation runs per ping with 2+ queries per fix | HIGH |
| F-16 | Read-through refresh performs writes on the read path | MEDIUM — Phase 4 |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| F-20 | Nightly backup buffers the whole database into one in-memory string | MEDIUM |
| F-21 | `vercel.json` schedules the Eagle Track cron **daily** | MEDIUM |
| F-25 | No error-monitoring backend | LOW — Phase 7 |
| S-1 | `middleware.ts` excludes non-versioned `/api/*`; every route is self-defending with no structural enforcement | **ARCHITECTURAL** |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| N-4 (Ph0) | `WORKFLOW_*` permissions are organization-level | MEDIUM — Phase 5 |
| P2-N1 (Ph2) | Historical/fuel ingestion still uses the vendor client directly | MEDIUM |

**S-1 remains the highest-leverage remaining item.** Nothing structurally
prevents the next route from forgetting its auth wrapper; a route-auth
conformance test would have caught two of Phase 0's three authorization
findings at PR time.

---

## Testing gaps Phase 3 did not close

- **No test against a real MongoDB.** The processor and publisher suites
  use in-memory doubles implementing the same lifecycle contract. They
  prove the processor's *logic* — claim-before-dispatch, backoff,
  dead-letter, duplicate skip, stale-lease reclaim — but **not** that
  Mongo's `findOneAndUpdate` is atomic under real concurrency, because the
  fake serialises everything. That atomicity is a property of MongoDB and
  of the unique index, which is asserted structurally instead. Stated in
  the suite headers rather than left for a reader to infer.
- **No test of two concurrent processors.** Requires a real database for
  the same reason.
- `test:e2e` and `test:performance` remain `echo` stubs.
