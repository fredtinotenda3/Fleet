# Findings outside Phase 0

Recorded during Phase 0 remediation and **deliberately not implemented**,
per the change-discipline rule that a finding outside the agreed scope is
written down rather than silently fixed.

Two categories: things found *while* remediating (new), and things the
audit already raised that Phase 0 does not touch.

---

## Found during Phase 0 remediation

### N-1 · Hardcoded Atlas credential — FIXED, but rotation is outstanding
**Severity: CRITICAL (exposure), remediated in-tree**

`scripts/count-fuellogs.ts` hardcoded a full MongoDB Atlas connection
string including the database password. This was **not** in the audit; it
surfaced in the repository-wide secret scan.

Fixed in-tree (reads `MONGODB_URI`, refuses to run without it) because
leaving a live database credential in a file while writing a report about
credential hygiene is not a defensible reading of "stay in scope".

**The credential itself is still valid and must be rotated in Atlas.**
That is an operator action outside this repository.

### N-2 · Workflow approve/reject had no HTTP route — FIXED
**Severity: HIGH (correctness), remediated**

`app/api/workflows/instances/[id]/steps/[stepId]/route.ts` contained a
mis-pasted copy of the instance route: same header comment, `params: {
id }` with no `stepId`, handlers calling `getInstance`/`cancelInstance`.

Two consequences: `approveStep`/`rejectStep` were unreachable over HTTP,
and instance read/cancellation was served at a path whose `[stepId]`
segment was required but never read — so `DELETE
/instances/abc/steps/anything` cancelled instance `abc`.

Fixed because F-4 requires enforcement at the API boundary, and that is
not expressible on a route that does not exist.

### N-3 · Alert store writes no `orgUnitId`
**Severity: MEDIUM · Not fixed**

`telematicsRepository.createAlert` writes no `orgUnitId`, while
`getActiveAlertsInScope` applies the org-unit predicate. A scoped caller
therefore matches **zero** alert rows, always.

This fails *closed*, so it is not a leak — it makes the alert store
invisible to exactly the roles it was built for. It is a data-model fix
(plus a backfill for existing rows), not an authorization fix, and it
belongs with the telemetry-integrity phase.

Note that F-7 does **not** depend on it: the live map derives its alert
field from the latest reading, and the WebSocket alert event now carries
the reading's own `orgUnitId`.

### N-4 · `WORKFLOW_*` permissions are organization-level
**Severity: MEDIUM · Not fixed**

Workflow definitions and instances are registered `level: 'organization'`
in `module-scope.registry.ts`, and every `WorkflowEngine` method takes
`tenantId: string` rather than a `TenantContext`.

Phase 0 closes the escalation (a driver can no longer approve anything)
but does **not** make instances org-unit scoped. A branch manager holding
`WORKFLOW_APPROVE` is still, at the permission layer, indistinguishable
from another branch's manager — the engine's assignee/role check is what
separates them today.

Deliberately deferred: making instances org-unit scoped changes the data
model and needs the ownership question answered first (the audit's
suggested split is org-level *definitions*, org-unit *instances*). That
is a design decision, not a patch.

### N-5 · `next lint` is removed in Next 15
**Severity: LOW · Not fixed**

`npm run lint` runs `next lint`, which Next 15 no longer provides;
`next.config.ts` also sets `ignoreDuringBuilds: true`, so lint failures
never block a build either. Migrating to the ESLint CLI is a build-tooling
change with no security content.

---

## Audit findings Phase 0 does not address

Unchanged from the audit of 22 August 2026. Listed here so the Phase 0
deliverable is not mistaken for a clean bill of health.

| ID | Finding | Severity |
|---|---|---|
| F-2 | Cartrack adapter fabricates measurement zeros (`fuelLevel ?? 0` and 9 more). Manufactures a high-severity low-fuel alert on every poll for every Cartrack vehicle; `odometer: 0` overwrites the real odometer | **CRITICAL** |
| F-3 | No unique index backs the telemetry idempotency tuple; six telematics collections have no index definitions at all; no TTL on `tblgeocode_cache` | **CRITICAL** |
| F-8 | Rate limiting is an in-memory `Map` — per-instance and reset on every cold start | HIGH |
| F-9 | Query cache is invalidate-only (one populate call, in a worker that does not run on Vercel) and keyed by tenant, not org unit | HIGH |
| F-10 | Multi-currency exists as type declarations only; nothing reads or writes `fx_rate` / `reporting_amount` | HIGH |
| F-11 | Transactional outbox is complete and dead; `EventBusFactory` returns `InMemoryEventBus` unconditionally | HIGH |
| F-12 | No telemetry retention policy — unbounded growth | HIGH |
| F-13 | Geofence evaluation runs per ping with 2+ queries per fix | HIGH |
| F-14 | Two action engines, both organization-scoped, neither idempotent | MEDIUM |
| F-16 | Read-through refresh performs writes on the read path and fails open across instances | MEDIUM |
| F-17 | Live map is a poll, not real-time, but is presented as live | MEDIUM |
| F-18 | `Math.random()` decides driver-incident severity in `driver-risk.service.ts:465` | MEDIUM |
| F-20 | Nightly backup buffers the entire database into one in-memory string | MEDIUM |
| F-21 | `vercel.json` schedules the Eagle Track cron **daily**; with no map open, no telemetry is ingested at all | MEDIUM |
| F-25 | No error-monitoring backend | LOW |
| S-1 | `middleware.ts` excludes non-versioned `/api/*`, so every route is self-defending with no structural enforcement | **ARCHITECTURAL** |

### On S-1

Worth singling out. Phase 0 fixed the three routes that had forgotten
their guard, but nothing *structurally* prevents the next one from
forgetting too. The pattern that works in this codebase already exists —
`module-scope-conformance.spec.ts` turns tenancy policy into a failing
build — and the equivalent for route authentication would be a
conformance test asserting that every `app/api/**/route.ts` export is
wrapped.

Two of the three Phase 0 authorization findings (F-4, F-5) would have
been caught at PR time by that single test. It is the highest-leverage
item remaining and it is small.

---

## Testing gaps this phase did not close

- **No integration or E2E tests.** `test:e2e` and `test:performance` are
  `echo` stubs; `test:integration` runs `--passWithNoTests`.
- **The F-7 suite is structural, not behavioural.** It asserts that the
  scoping code is present and correctly shaped, not that a live socket is
  denied delivery. Proving the latter needs a real transport and a live
  Mongo, i.e. the integration harness that does not exist yet.
- **No Cartrack adapter tests at all** — which is why F-2 survived a type
  widening explicitly designed to prevent it.
