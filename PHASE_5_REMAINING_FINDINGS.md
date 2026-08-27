# Findings outside Phase 5

Recorded during Phase 5 and **deliberately not implemented**, per the
change-discipline rule.

---

## Found during Phase 5

### P5-N1 · `NotificationHandler` and `WebhookDispatchHandler` remain non-idempotent
**Severity: MEDIUM · Recorded, not fixed (explicitly out of scope)**

Phase 3 identified three non-idempotent handlers. Phase 5 fixed the
sharpest one — `WorkflowTriggerHandler`, where a duplicate started a
second **approval instance**. The other two are unchanged:

- **`NotificationHandler`** — a duplicate delivery sends a second
  notification.
- **`WebhookDispatchHandler`** — a duplicate posts twice to the
  subscriber.

Not fixed because the Phase 5 brief says explicitly not to expand into
notification/webhook redesign, and neither has a small safe fix:
notifications would need a dedupe key on the notification record plus a
unique index, and webhooks would need delivery-attempt de-duplication
that interacts with the existing retry logic. Both are real changes to
subsystems this phase did not otherwise touch.

The severity difference is worth stating: a duplicate notification or
webhook is **visible but not corrupting** — a subscriber sees the same
event twice and can dedupe on `eventId`, which the payload carries. A
duplicate workflow instance was corrupting, because whichever was decided
second silently left the first in-flight.

### P5-N2 · `tblworkflowruns` was a phantom collection in the scope registry
**Severity: LOW · FIXED in passing**

`module-scope.registry.ts` listed `tblworkflowruns` under the workflows
module. No such collection exists — the instance collection is
`tblworkflow_instances` (see `workflow.repository.ts`).

Corrected rather than left, because a registry entry naming a collection
that does not exist makes any future conformance check pass against a
phantom while the real collection goes unchecked. That is the exact
failure mode the registry was built to prevent.

### P5-N3 · `WorkflowInstance.entityType` is unvalidated free text
**Severity: LOW · Not fixed**

`entityType` is a bare `string` a rule author can write, and
`resolveInstanceOrgUnit` handles it with an explicit switch — an unknown
type resolves to `null` (organization-wide visibility only), which is
safe.

Not fixed because narrowing it to a union would be a breaking change to
the workflow definition schema, and existing definitions may carry types
the union would reject. The fail-closed resolver makes the looseness
harmless today; tightening it belongs with a definition-schema change.

### P5-N4 · Instance escalation (`processTimeouts`) is not org-unit scoped
**Severity: LOW · Not fixed, by design**

`processTimeouts` sweeps a tenant's overdue instances and escalates them.
It runs from a cron/worker with no acting user and no org unit, so it is
deliberately cross-unit — like the outbox processor and the schedulers.

It performs no authorization decision: it notifies the escalation target
recorded on the workflow definition, and does not approve, reject or
cancel anything. Scoping it would mean it silently stopped escalating for
every unit but one.

Recorded rather than silently accepted, because "this sweep is
intentionally cross-unit" is the kind of exemption that should be written
down where the next reader will find it.

---

## Audit findings Phase 5 does not address

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-10 | Multi-currency exists as type declarations only | HIGH |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| F-25 | No error-monitoring backend | LOW — Phase 7 |
| S-1 | `middleware.ts` excludes non-versioned `/api/*`; every route is self-defending with no structural enforcement | **ARCHITECTURAL** |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| P2-N1 (Ph2) | Historical/fuel ingestion still uses the vendor client directly | MEDIUM |
| P4-N1 (Ph4) | Reports read raw telemetry, not rollups, so a window older than retention returns empty | MEDIUM |
| — | Intelligence is analytics-only; nothing dispatches an operational action | Phase 6 |

**S-1 remains the highest-leverage remaining item.** Nothing structurally
prevents the next route from forgetting its auth wrapper. Phase 5's
service-layer authorization narrows the blast radius for workflows
specifically — the engine now refuses regardless of how it was reached —
but that is one module, not a platform guarantee.

---

## Testing gaps Phase 5 did not close

- **No test against a real MongoDB.** The partial unique index that
  enforces idempotency under concurrency is asserted **structurally**
  (its shape, uniqueness and partial filter) and its consequence is
  tested with a simulated 11000. Proving two genuinely concurrent
  handlers produce one instance needs a real database; the fake
  serialises everything. Stated in the suite rather than left to infer.
- **No end-to-end test through the outbox.** The handler passes
  `event.eventId` and the key builder is deterministic, both tested — but
  nothing exercises publish → processor → redelivery → single instance in
  one run. That needs the integration harness `test:integration`
  (`--passWithNoTests`) still does not provide.
