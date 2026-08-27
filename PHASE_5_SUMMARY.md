# Phase 5 — Automation Scope & Authorization

Implemented on top of Phases 0–4.

## Status

| Item | Result |
|---|---|
| Workflow instances org-unit scoped | **FIXED** |
| Workflow service-layer authorization | **FIXED** |
| Idempotent workflow starts | **FIXED** |
| Idempotent rule firing | **FIXED** |
| Phase 0 regression | **PASSED** |
| Phase 1 regression | **PASSED** |
| Phase 2 regression | **PASSED** |
| Phase 3 regression | **PASSED** |
| Phase 4 regression | **PASSED** |
| Engines consolidated? | **No** — correctly left separate |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1201 passed / 1201, 72 suites** |
| Baseline 1164 / 71 | **+37 tests, 0 regressions** |
| Phase 0–4 regression (15 suites) | **375 passed / 375** |
| New Phase 5 suite | **34 passed** |

---

## ⚠ One baseline discrepancy, before anything else

The uploaded tree differed from the Phase 4 deliverable in exactly one
file: **`vercel.json`**, reverted from `*/5 * * * *` to `0 0 * * *`. The
baseline was therefore **1163/1164 with one failure**, not clean.

That revert is almost certainly correct — **Vercel Hobby permits only
daily crons**, which the Phase 4 documentation stated. The failing
assertion was **mine, and it was wrong**: it pinned a deployment-plan
value, which makes the repository un-deployable on Hobby.

Corrected in `tests/security/ingestion-scale-guards.spec.ts` to assert
the property F-21 actually cares about — that the **worker schedule**
(every 2 minutes, independent of HTTP) is the sub-hourly ingestion path,
so a fleet nobody is watching still ingests. The cron endpoint remains a
trigger for deployments without a worker, never the only path.

**If the revert was for some other reason, say so** — the correction
assumed the Hobby constraint.

---

## What changed

### 1. Instances are org-unit scoped; definitions are not

| | Scope | Why |
|---|---|---|
| `tblworkflows` | **Organization** | Approval **policy** is company-wide. Scoping it per branch would mean copies that drift, and a branch could not see the rules it is held to. |
| `tblworkflow_instances` | **Org unit** | An instance is one branch's actual **request**. |

Every `WorkflowEngine` method previously took a bare `tenantId`, so the
caller's accessible org units were discarded at the door — a branch
manager holding `WORKFLOW_APPROVE` was indistinguishable from any other
branch's at the permission layer.

`WorkflowActor` now carries `accessibleOrgUnitIds` and `permissions`.
The repository gained `getInstancesInScope` / `getInstanceInScope`, with
the scope filter spread **last** so a caller-supplied `orgUnitId` cannot
widen the predicate. There is deliberately **no `getWorkflowsInScope`**.

### 2. Ownership derived from the target entity

`workflow-ownership.resolver.ts` reads the expense / work order /
vehicle the workflow is about and takes its `orgUnitId` — never the
request context. This matters more than it did for `AttentionItem`:
instances are frequently started by background handlers with **no
context at all**.

Fail-closed on every branch. Unresolvable → no `orgUnitId` → visible
only to organization-wide callers. Unresolvable makes an instance
*harder* to see, not easier.

### 3. Authorization in the engine, not only the route

Three ordered checks: `assertPermission` (before the instance is loaded,
so an unauthorized caller cannot probe ids) → `isInstanceInScope` (**404,
never 403**) → `isAuthorizedForStep` (Phase 0, unchanged).

**Absence denies.** `accessibleOrgUnitIds: undefined` → `[]` (nothing),
not `null` (everything); `permissions: undefined` → holds nothing. Before
Phase 5 every caller was implicitly organization-wide, so a
partially-migrated caller that forgets scope must **lose** access.

> This is why **10 Phase 0 workflow tests failed** mid-implementation —
> all ALLOW cases, no DENY cases. Their actor helper was updated to
> supply the now-required context rather than weakening the gates.

### 4. Idempotency

`sha256(source ␀ workflowId ␀ entityType ␀ entityId ␀ causeId)`.

Deterministic, because a UUID is new on every retry and dedupes nothing.
`causeId` is the DomainEvent's `eventId` — Phase 3's `StoredDomainEvent`
preserves it across redelivery, which is what makes this work at all.
NUL-separated so `('ab','c')` cannot collide with `('a','bc')`.

**Manual starts get no key**, deliberately: a person may legitimately
raise two approvals, and suppressing the second would look like a broken
button.

Two layers: a read before create, plus a **partial unique index** for two
handlers racing past that read. The loser's 11000 is caught and resolved
by returning the **winner's** instance.

Wired into `WorkflowTriggerHandler` (event id) and the `start_workflow`
rule action (rule id).

### 5. Engines NOT consolidated

RuleEngine (stateless condition → action) and WorkflowEngine (stateful
approval) remain separate; `RuleActionRegistry` remains the action seam.
Consolidating them would have burned effort without addressing scope,
authorization or idempotency — the actual defects.

---

## Files

**New (3)**
```
modules/workflows/services/workflow-ownership.resolver.ts   ownership from the target entity
modules/workflows/services/workflow-idempotency.ts          deterministic dedupe key
tests/security/workflow-org-unit-scope.spec.ts              34 tests
```

**Modified (11)**
```
modules/workflows/services/workflow-engine.service.ts   scope + permission gates, idempotent start
modules/workflows/services/workflow-trigger.service.ts  threads causeId
modules/workflows/repositories/workflow.repository.ts   scoped reads + key lookup
modules/workflows/controllers/workflow.controller.ts    supplies full actor from auth context
modules/workflows/types/workflow.types.ts               + orgUnitId, idempotencyKey
modules/rules/actions/default-actions.ts                rule-driven starts keyed
server/events/handlers/workflow/WorkflowTriggerHandler.ts  passes event.eventId
server/tenancy/module-scope.registry.ts                 workflows -> org-unit; phantom collection fixed
infrastructure/database/indexes.workflows-addendum.ts   partial unique + scope index
tests/security/workflow-authorization.spec.ts           actor helper updated for the new model
tests/security/ingestion-scale-guards.spec.ts           cron assertion corrected (see above)
docs/AUTOMATION_SCOPE.md                                architecture
```

---

## Manual steps

1. `npm ci`
2. `npm run db:indexes` — creates `uniq_winstance_tenant_idempotency`
   (partial unique) and `idx_winstance_tenant_unit_status`.
3. Deploy.

**No backfill is required, and none is provided.** Instances written
before Phase 5 have no `orgUnitId` and are visible only to
organization-wide callers — the fail-closed reading. Back-filling would
mean guessing which unit each historical request belonged to, and a wrong
guess puts one branch's approval into another's queue. Set `orgUnitId`
directly on a specific old instance if it needs scoping.

**Backward compatibility:** no public API changed. `startWorkflow`'s
`idempotencyKey` is an optional sixth parameter, so existing callers
compile and behave as before. The engine's new gates are additive
refusals, not signature changes to the route surface.

---

## Remaining — outside Phase 5

`PHASE_5_REMAINING_FINDINGS.md` has the full list. Worth naming here:

- **`NotificationHandler` and `WebhookDispatchHandler` are still
  non-idempotent**, per the brief's instruction not to expand into
  notification/webhook redesign. Severity is genuinely lower: a duplicate
  notification is *visible but not corrupting*, and a subscriber can
  dedupe on the `eventId` the payload carries. The duplicate workflow
  instance was corrupting.
- **No test against a real MongoDB.** The partial unique index is
  asserted structurally and its consequence tested with a simulated
  11000; proving two genuinely concurrent handlers produce one instance
  needs a real database.
- **S-1** (`middleware.ts` excludes non-versioned `/api/*`) remains the
  highest-leverage architectural item.
