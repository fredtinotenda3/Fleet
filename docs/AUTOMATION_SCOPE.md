# Automation Scope & Authorization

How workflow instances are scoped, authorized, and de-duplicated.

```
event / rule ──► idempotency key ──► startWorkflow ──► instance
                 (deterministic)          │            ├─ orgUnitId  (from target entity)
                                          │            └─ idempotencyKey (unique index)
                                          │
approve/reject/cancel ──► permission gate ──► org-unit scope ──► step authorization
                          (engine)             (engine)           (assignee / role)
```

---

## Definitions are organization-level. Instances are not.

This asymmetry is deliberate and is the core of Phase 5.

| | Scope | Why |
|---|---|---|
| `tblworkflows` (definitions) | **Organization** | "Purchases over $5,000 need a manager" is company-wide approval **policy**. Scoping per branch would mean maintaining copies that drift — and a branch could not see the rules it is held to. |
| `tblworkflow_instances` | **Org unit** | An instance is one branch's actual **request**. A Bulawayo manager has no business reading, approving or cancelling Harare's. |

Before Phase 5 every `WorkflowEngine` method took a bare `tenantId`, so
the caller's accessible org units were discarded at the door. A branch
manager holding `WORKFLOW_APPROVE` was indistinguishable from any other
branch's manager at the permission layer.

There is deliberately **no `getWorkflowsInScope`**. The repository has
`getInstancesInScope` / `getInstanceInScope` and nothing equivalent for
definitions.

---

## Ownership is derived, never supplied

`resolveInstanceOrgUnit(entityType, entityId, tenantId)` reads the
**target entity** — the expense, work order, vehicle the workflow is
about — and takes its `orgUnitId`, which that entity already inherited
from its own vehicle or driver at write time.

This matters more here than it did for `AttentionItem` in Phase 0:
workflow instances are frequently started by a **background handler**
(an outbox event, a rule action) with no acting user and no active org
unit. The caller's context is not merely the wrong source — it is
usually absent.

**Fail-closed.** The resolver never throws and never guesses. An unknown
`entityType`, a cross-tenant id, an entity with no unit of its own, or a
lookup that throws all return `null` — and an instance with no
`orgUnitId` is visible **only to organization-wide callers**, never
broadcast to every unit. Unresolvable makes an instance *harder* to see,
not easier.

`entityType` is free text a rule author can write, so the resolver uses
an explicit switch rather than a generic cross-collection lookup. An
unknown type is unresolvable, and unresolvable is safe.

---

## Authorization runs in the engine, not only the route

Phase 0 added the `WORKFLOW_*` permissions and enforced them at the API
boundary. That is necessary and not sufficient: **a permission enforced
in exactly one layer is enforced only for callers that go through that
layer**, and the rule engine's `start_workflow` action, the outbox event
handler and any future service reach the engine directly.

Three checks now run, in order:

1. **`assertPermission`** — "may this role decide workflow steps at
   all". Runs **before the instance is loaded**, so an unauthorized
   caller cannot use timing or error shape to learn whether an id exists.
2. **`isInstanceInScope`** — "is this instance in the caller's org
   units". Returns **404, never 403**: a 403 would confirm the instance
   exists, which tells a caller probing ids something real about another
   branch's operations. Same reasoning as `assertVehicleInScope`.
3. **`isAuthorizedForStep`** — "is this the right *person* for *this*
   step" (assignee list, named role, self-approval). Unchanged from
   Phase 0 and still fail-closed.

All three are needed. A permission can never answer question 3, and the
engine can never answer question 1 for a caller that bypasses it.

### Fail-closed defaults

`WorkflowActor.accessibleOrgUnitIds` and `.permissions` are both
optional, and **absence denies**:

- `accessibleOrgUnitIds: undefined` → `[]` (scoped to nothing), **not**
  `null` (organization-wide).
- `permissions: undefined` → holds nothing.

Before Phase 5 every caller was implicitly organization-wide, so a
partially-migrated caller that forgets to pass scope must **lose**
access, not gain it. Treating absence as "the caller already checked" is
exactly the assumption that made `isAuthorizedForStep` fall through to
`return true` before Phase 0.

---

## Idempotency

Phase 3 made event delivery **at-least-once**, and recorded
`WorkflowTriggerHandler` as non-idempotent. A redelivered event — the
outbox processor crashing between dispatch and completion, then
reclaiming the row after its lease expired — called `startWorkflow`
again and a **second approval instance** appeared for the same expense:
two managers asked to approve one thing, two audit trails, and whichever
was decided second silently left the first in-flight.

### The key is a function of the cause

```
sha256(source ␀ workflowId ␀ entityType ␀ entityId ␀ causeId)
```

A UUID generated at start time is new on every retry and dedupes
nothing. The key must compute identically on every attempt, in every
process, after any restart.

`causeId` is the **DomainEvent's `eventId`** for event-driven starts —
Phase 3's `StoredDomainEvent` preserves it across redelivery rather than
generating a new one, and that property is what makes de-duplication
possible at all. For rule-driven starts it is the rule's id.

Components are **NUL-separated** because naive concatenation makes
`('ab','c')` and `('a','bc')` identical, which would silently merge two
different workflows. The digest is hashed because the raw components can
exceed MongoDB's ~1024-byte index key limit — and an index that rejects
long keys would fail on exactly the longest, least-common cases.

### Manual starts get no key

Deliberately. A person may legitimately raise two approvals for the same
entity; suppressing the second would look like a broken button, and the
failure would be silent. Automated repeats have no such ambiguity.

### Two layers, because the read alone is not correct

1. `findInstanceByIdempotencyKey` before creating — the cheap common path.
2. A **partial unique index** on `{tenantId, idempotencyKey}` — for two
   handlers racing past that read simultaneously. The loser gets an
   11000, which `startWorkflow` catches and resolves by returning the
   **winner's** instance. The point is that exactly one exists, not that
   we created it.

**Partial**, on `idempotencyKey: {$exists: true}`. Most instances
legitimately have no key; a plain unique index would collapse every
keyless instance in a tenant into one and break manual starts entirely.

---

## The engines are not consolidated

Unchanged, per the audit:

- **RuleEngine** — stateless condition → action.
- **WorkflowEngine** — stateful multi-step approval.
- **RuleActionRegistry** — the action seam, still the way to add an
  action type.

They compose correctly (`start_workflow` is a registered rule action).
Consolidating two correctly-separated engines would have burned effort
without addressing scope, authorization or idempotency — which were the
actual defects.

---

## Migration

`npm run db:indexes` creates:

| Index | Purpose |
|---|---|
| `uniq_winstance_tenant_idempotency` (**partial unique**) | The idempotency constraint |
| `idx_winstance_tenant_unit_status` | Org-unit scoped instance reads |

**No backfill is required, and none is provided.** Instances written
before Phase 5 have no `orgUnitId`, so they are visible only to
organization-wide callers — the fail-closed reading. That is the correct
default: back-filling would mean guessing which unit each historical
request belonged to, and a wrong guess puts one branch's approval into
another's queue. An operator who needs a specific old instance scoped can
set its `orgUnitId` directly.

Existing instances also have no `idempotencyKey`, which the partial index
ignores.
