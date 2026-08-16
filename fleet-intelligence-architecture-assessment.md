# FLEET OPERATING INTELLIGENCE PLATFORM — ARCHITECTURE ASSESSMENT

**No code changed in this pass.** Per §5 and §32, this is the audit and plan. Awaiting approval before Phase 1.

**Baseline verified on the uploaded archive** (not assumed — installed and executed):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx jest` (full suite) | **382 passed / 382, 29 suites, 0 failures** |

That 382 matches the figure in your directive, so the archive and the brief agree. It also confirms three tests were added after my Phase 6 hand-off (379 → 382) — the archive contains a `CHANGELOG-workorders-frontend-completion.md` I did not write, so another session has been working here. My Phase 6 backend and the finance frontend are both present and intact.

---

## 1. CURRENT ARCHITECTURE ASSESSMENT

This platform is substantially further along than the directive assumes. 37 backend domain modules, a full CQRS + domain-event layer with a transactional-outbox implementation, 14 BullMQ workers, three cache layers, and a tenancy system with structural conformance guards. The honest summary:

**The target architecture in §4 is roughly 60% present in source, but three of its load-bearing layers are either duplicated, unscoped, or not executing.** The work is not building the pipeline. It is consolidating, scoping, and switching on what already exists — then adding the genuinely missing pieces (Opportunities, verification, TCO/replace-vs-keep, simulation, executive intelligence).

Six findings drive the whole plan.

### FINDING 1 — The Action Engine already exists. Twice. 🔴

`modules/workflows/` (`WorkflowEngine`: start/approve/reject/cancel/processTimeouts, step instances, escalation timeouts) and `modules/rules/` (`RuleEngine`, condition trees with 14 operators, `RuleActionRegistry` with pluggable executors, domain events for rule CRUD).

Critically, `modules/rules/actions/default-actions.ts` already registers five executors — `publish_event`, `notify`, `audit_log`, `start_workflow`, `set_variable` — and `RuleActionRegistry.register(type, executor)` is explicitly designed so *"other modules register their own executors at bootstrap time instead of modifying this shared type file."*

**That registry IS the Action Engine seam §9 asks for.** Building a third engine would be the single worst decision available here. Phase 3 becomes: register new executors (`create_work_order`, `reserve_bay`, `schedule_coaching`, …) against the existing registry, and add the approval gate by routing sensitive executors through `start_workflow`, which already has approvals, escalation, and timeouts.

### FINDING 2 — Both automation engines are organization-scoped, not org-unit scoped. 🔴 **Needs your decision**

`module-scope.registry.ts` records `workflows` and `rules` as `level: 'organization'`, **`confirmed: true`** — a deliberate, signed-off decision. Confirmed in code: every `WorkflowEngine` method takes `tenantId: string`, never a `TenantContext`, and neither `Workflow` nor `Rule` extends `OrgUnitScopedEntity` (no `orgUnitId` field).

This collides head-on with §9's requirement that actions be *"tenant scoped, authorized"* and §26's *"maintain enterprise-grade authorization, tenant isolation."* Today a Harare-scoped manager and a Bulawayo-scoped manager operate the same org-wide rule set, and a workflow instance carries no branch ownership.

Two options, and this is a product call I should not make for you:

- **(A) Accept org-level automation.** Rules and approval workflows are organization policy, authored by org admins only. Cheapest, and defensible — it mirrors why `compliance` rules were left org-wide in Phase F. Cost: a branch cannot own its own automation, and every action fired by a rule needs the *executor* to re-derive scope from the target entity.
- **(B) Promote both to org-unit.** Correct for a multi-branch enterprise, and required if branch managers are to own their own action queues. Cost: a schema migration on `tblworkflows`/`tblworkflowinstances`/`tblrules`, `TenantContext` threaded through ~15 method signatures, and `processTimeouts` (a background sweep) needs scoping — which is exactly the class of unscoped aggregate that leaked twice in Phase F/H.

My recommendation: **(A) for rules/workflow *definitions*, (B) for action *instances*.** Policy is org-wide; the resulting work item belongs to a branch. That splits the difference without a full migration and is the only version where a branch manager's action queue is meaningful.

### FINDING 3 — The transactional outbox is dead code. 🔴

`server/events/outbox/` contains `OutboxEvent`, `OutboxRepository`, `OutboxPublisher`, `OutboxProcessor` — a complete at-least-once delivery implementation. **`OutboxProcessor` and `OutboxPublisher` are never instantiated anywhere in the repository.** The only reference outside their own directory is a comment.

Meanwhile `EventBusFactory.getInstance()` returns `new InMemoryEventBus()` unconditionally — no distributed option.

I initially suspected the whole event layer was unwired and that was **wrong**: `bootstrapEvents()` → `bootstrapCqrs()` is called from `instrumentation.ts` on the Node runtime, plus at module load in three controllers. The bus and its 14 handler families are live. But the delivery guarantee is not: events are in-memory, best-effort, single-instance. If a handler throws after `RetryMiddleware` exhausts, the event is gone; on multi-instance deploy, events published on instance A never reach handlers on instance B.

**This directly blocks §9's "idempotent, retry-safe" requirement and §10's closed loop.** A predictive-maintenance finding that fires a work-order action must not be lost because a pod recycled. Switching the outbox on is a prerequisite for Phase 3, not a nice-to-have — and the code is already written, which makes it cheap.

### FINDING 4 — Three overlapping intelligence models already exist. Do not add a fourth. 🟡

| Model | Nature | Scoping |
|---|---|---|
| `NeedsAttentionItem` (`modules/ai`) | Transient, recomputed per request from 5 AI services + compliance + maintenance | derived |
| `AttentionItem` (`modules/attention`) | **Persisted** snapshot, `OrgUnitScopedEntity`, has `status`/`resolvedAt`/`resolvedBy`, idempotent upsert on `{tenantId, itemKey}` | org-unit, `confirmed: false` |
| `Anomaly` (`modules/intelligence`) | Persisted anomaly records with their own repository/controller | org-unit, `confirmed: false` |

`AttentionItem` is already ~70% of the `IntelligenceEvent` in §6: it has type/severity/urgency/cost/priorityScore/entityId/lifecycle/first-and-last-seen. **Phase 1 should extend `AttentionItem`, not introduce `IntelligenceEvent`** — §6 explicitly permits this ("Do not blindly use these exact fields if the existing architecture already has equivalent concepts"). What's genuinely missing from it: `evidence[]`, `metrics[]`, `confidence`, `estimatedSavings`/`financialExposure`, `recommendedActions[]`, `assignedTo`, `modelVersion`/`ruleVersion`, `observedFrom`/`observedTo`.

The `Anomaly` model is the harder question — it overlaps `AttentionItem` and needs either folding in as a source or a documented reason to stay separate.

### FINDING 5 — 🔴 **The persisted intelligence layer may be tagging the wrong org unit.** Fix this before anything is built on top.

From `attention-item.types.ts`, written by the session that built it:

> *"its current limitation: it tags the ACTIVE org unit for the request rather than resolving each item's true owning entity, which is why the decision is still `confirmed: false`."*

So an attention item about a Bulawayo vehicle, generated during a request by a user whose active unit is Harare, is persisted with `orgUnitId: harare`. It is then visible to Harare and invisible to Bulawayo — the branch that actually owns the vehicle.

Everything the directive wants stacks directly on this: Opportunities, the Action Engine, outcome verification, and the Value Ledger. Build on mis-scoped rows and every downstream artefact inherits the error, including financial ones. **This is the true Phase 0, and it is small: resolve `orgUnitId` from the item's target entity at upsert time rather than from request context.** It also promotes `attention` to `confirmed: true`.

### FINDING 6 — 🔴 Entity identity is inconsistent across exactly the boundary the closed loop must cross.

- `NeedsAttentionItem.entityId` — documented as *"License plate / vehicle or driver identifier"*
- `AllocationPosting.vehicleId` — the vehicle's Mongo `_id` (Phase 6; plates are mutable, so `_id` is correct for a financial ledger)
- `Expense` / `FuelLog` / `Trip` — `license_plate`

§10's loop is: AI finding → action → work order → **Value Ledger**. That path crosses all three conventions. Every hop compiles fine (string → string) and fails silently, which is precisely the shape of the slug-vs-ObjectId bug and the `_id`-vs-plate issue I flagged in Phase 6. **A single `VehicleIdentityResolver` (plate ⇄ `_id`, scope-checked, cached per request) is a hard prerequisite for Phase 4.** Without it the loop will appear to work and quietly write value-ledger entries against the wrong vehicle.

---

## 2. WHAT ALREADY SATISFIES THE SPECIFICATION

| § | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Multi-tenancy, fail-closed authz, conformance guards | **EXISTS — strong** | `tenant-scope.ts`, `module-scope.registry` (34 entries with rationale), 382 tests |
| 2 | 5 AI services, Needs Attention, Value Ledger, Command Centre, SavingsStrip | **EXISTS** | `modules/ai`, `modules/attention`, `CommandCentrePage` |
| 4 | Event / data layer | **EXISTS — strong** | `DomainEvent`, bus + factory, 5 middleware (retry/audit/metrics/validation/logging), `EventRegistry`, 5 domain publishers, 14 handler families incl. `IntelligenceHandler`, `WorkflowTriggerHandler`, `AIPredictionTriggerHandler`, `DigitalTwinProjectionHandler`, 113 event names |
| 9 | Action execution + approvals | **EXISTS (duplicated)** | `RuleActionRegistry` + `WorkflowEngine` — see Finding 1 |
| 13 | Cost engine, cost/km, depreciation, FX, GL reconciliation | **EXISTS** | Phase 6 `modules/finance` (allocation ledger, FX policy, multi-currency, GL variance) |
| 21 | Live map, telematics, geofencing | **EXISTS** | `modules/telematics` (18 files), Cartrack adapter, geofence alerts |
| 25 | Reporting: CSV/Excel/PDF, scheduled, exports | **EXISTS** | `modules/reporting` (44 files), `ReportQueryEngine` (org-unit scoped, Phase H) |
| 26 | Queues, retries, DLQ, observability | **EXISTS** | 14 workers, `dead-letter.service`, OTel via `instrumentation.ts` |
| 26 | Caching | **EXISTS** | `cache.service`, `query-cache.service`, `permission-cache.service` |

---

## 3. PARTIALLY IMPLEMENTED

| § | Requirement | What's there | What's missing |
|---|---|---|---|
| 6 | Unified intelligence model | `AttentionItem` persisted + lifecycle | `evidence[]`, `metrics[]`, `confidence`, impact fields, `recommendedActions[]`, `assignedTo`, model/rule versioning |
| 7 | Explainability | Per-service `confidence` and recommendations | **Five incompatible shapes**: `FleetHealthScore.recommendations: FleetHealthRecommendation[]`, `DriverRiskScore.recommendations: string[]`, `FuelFraudAlert.recommendation: string`. No shared `evidence[]`. No "what if we do nothing" projection. `AIConfidence` is an enum on `AIPrediction` but a `number` on `AIResult` — same concept, two types |
| 9 | Action Engine | Registry + 5 executors + approvals | Fleet-domain executors, idempotency keys, verification step, reversibility |
| 10 | Closed loop | Value Ledger with realised-vs-modelled + baseline tiers | Nothing writes to it automatically; no outcome verification; no identity resolver (Finding 6) |
| 11 | Vehicle Digital Twin | `modules/digital-twin` + projection handler; vehicle page has Overview/Specs/Analytics/Activity/**Costs** | Live state, health composite, predictions, unified timeline, open findings |
| 12 | Driver Intelligence | `driver-risk.service` with sub-scores | No score-change explanation ("72 → 81 because…"), no coaching history |
| 19/20 | AI Copilot + NL analytics | AI services + `ReportQueryEngine` as a governed query layer | No copilot, no intent→query-plan pipeline |
| 22 | Exception management | Needs Attention aggregation + priority score | Real-time telematics exceptions (deviation, unexpected stop, ETA breach) not modelled as intelligence |

---

## 4. MISSING

Genuinely absent, no existing implementation to extend:

1. **Opportunity model and Opportunity Center** (§8) — the system detects problems, never quantified upside. This is the largest true gap and the highest-value one commercially.
2. **Outcome verification** (§10) — nothing compares predicted exposure against actual cost after an action completes.
3. **TCO beyond cost/km** (§13) — no acquisition/financing/tyres/downtime/admin dimensions; no cost/day, cost/trip, cost-by-class.
4. **Replace vs Keep** (§14).
5. **Utilization decomposition** (§15) — no idle/unavailable/workshop/dispatch-gap breakdown.
6. **Fleet profitability** (§16) — **no revenue data model exists at all.** Per §16 this should be an extension point, not invented values.
7. **What-If simulation** (§17).
8. **Executive intelligence surface** (§18).
9. **Finance collection indexes** — `tblallocationledger`, `tbldepreciationprofiles`, `tblglsubmissions` have **no index definitions**. `attention` got `indexes.attention-addendum.ts`; finance did not. **This is my own Phase 6 omission** and it will bite as soon as the ledger has volume, because every cost figure is an aggregation over it.

---

## 5. DUPLICATE / ARCHITECTURALLY WEAK

| Item | Class | Detail |
|---|---|---|
| `workflows` + `rules` | **DUPLICATE** | Two automation engines. Consolidate on `rules` → `RuleActionRegistry`, use `workflows` only as the approval executor |
| `predictive-maintenance.service.ts` × 2 | **DUPLICATE** | Exists in both `modules/ai/services/` and `modules/intelligence/services/`. Must determine which is authoritative before Phase 1 |
| `AttentionItem` vs `Anomaly` | **DUPLICATE (probable)** | Overlapping persisted intelligence records |
| `event-names.ts` × 2 | **DUPLICATE (probable)** | `server/events/event-names.ts` and `infrastructure/observability/event-names.ts` |
| Outbox | **DEAD CODE** | Complete implementation, never instantiated (Finding 3) |
| `InMemoryEventBus` only | **WEAK** | No distributed bus; unsafe across instances |
| `AttentionItem.orgUnitId` | **WEAK — correctness** | Tags request's active unit, not the item's owner (Finding 5) |
| `ai`, `analytics`, `esg` | **WEAK — governance** | Not in `module-scope.registry` at all. AI services are reportedly scoped, but they are the layer that will generate every Opportunity and Action, so their scope decision must be *recorded and conformance-tested*, not implicit |
| Entity identity | **WEAK — correctness** | Plate vs `_id` vs plate across intelligence/finance/operations (Finding 6) |

---

## 6. PROPOSED ARCHITECTURE

Your §4 pipeline, mapped onto what exists. **Bold = new. Everything else already exists and is extended.**

```
TELEMATICS · OPERATIONS · FINANCE · DRIVER · WORKSHOP · COMPLIANCE
        ↓                    (existing modules, unchanged)
EVENT / DATA LAYER           server/events + CQRS  ← SWITCH ON OUTBOX
        ↓
ANALYTICS + AI               modules/ai (5 services) + modules/analytics
        ↓                    ← normalise via **IntelligenceAdapter**
FLEET INTELLIGENCE ENGINE    AttentionItem, EXTENDED (evidence, confidence,
        ↓                    impact, recommendedActions, modelVersion)
ATTENTION  +  **OPPORTUNITIES**   existing queue  +  **Opportunity model**
        ↓
DECISION ENGINE              modules/rules — RuleEngine + condition trees
        ↓
ACTION ENGINE                RuleActionRegistry + **fleet executors**,
        ↓                    approvals via existing WorkflowEngine
OPERATIONS                   workorders, workshop, scheduling, dispatch
        ↓
**OUTCOME VERIFICATION**     **new: predicted vs actual after completion**
        ↓
VALUE LEDGER                 modules/attention — existing, realised vs modelled
        ↓
ROI / **EXECUTIVE INTELLIGENCE**
```

Two cross-cutting prerequisites that are not layers but gate everything above them:

- **`VehicleIdentityResolver`** — plate ⇄ `_id`, scope-checked (Finding 6)
- **`AttentionItem.orgUnitId` correctness** — resolve from target entity (Finding 5)

---

## 7. IMPLEMENTATION PHASES

I've inserted a **Phase 0** and reordered slightly. §30 permits this where "repository evidence shows a dependency requires otherwise" — and Findings 3, 5 and 6 are exactly that: the intelligence foundation is currently sitting on a mis-scoped column and a best-effort bus.

### PHASE 0 — Foundation integrity (prerequisite, small, high risk-reduction)
Fix `AttentionItem.orgUnitId` to resolve from the target entity; promote `attention` to `confirmed: true`. Add `VehicleIdentityResolver`. Add `indexes.finance-addendum.ts`. Resolve the duplicate predictive-maintenance service. Register `ai`/`analytics`/`esg` in the scope registry. Adversarial tests for each.

### PHASE 1 — Intelligence foundation (§6, §7)
Extend `AttentionItem` with `evidence[]`, `metrics[]`, `confidence`, `estimatedImpact`/`estimatedSavings`/`financialExposure`, `recommendedActions[]`, `assignedTo`, `observedFrom`/`observedTo`, `modelVersion`/`ruleVersion`. Add an **IntelligenceAdapter** that normalises the five AI services' incompatible recommendation shapes into it — without rewriting those services. Add "what if we do nothing" projection. Surface all of it in the existing Command Centre.

### PHASE 2 — Event reliability (§9, §26) — *moved earlier*
Instantiate `OutboxPublisher`/`OutboxProcessor`; run the processor as a BullMQ worker alongside the existing 14. Idempotency keys on event handling. This must precede the Action Engine, not follow it.

### PHASE 3 — Action Engine (§9)
Register fleet executors against `RuleActionRegistry`: `create_work_order`, `schedule_maintenance`, `assign_technician`, `reserve_bay`, `reserve_parts`, `notify_driver`, `create_compliance_task`, `create_procurement_request`, `create_investigation`, `schedule_coaching`. Approval gate via `start_workflow`. Idempotency, retry, reversibility, audit. **Blocked on the Finding 2 decision.**

### PHASE 4 — Opportunity Engine (§8)
`Opportunity` model (sibling of `AttentionItem`, same lifecycle, plus expected/realised value and owner/deadline). Detectors for utilisation, fuel, maintenance, right-sizing, procurement. Opportunity Center UI.

### PHASE 5 — Closed loop + verification (§10)
Outcome verification service; auto-write to the existing Value Ledger with baseline tier and realised-vs-modelled separation (already modelled — reuse exactly).

### PHASE 6 — Vehicle Digital Twin (§11)
Compose from existing domain services; unified timeline; no data duplication.

### PHASE 7 — Driver Intelligence (§12) · **PHASE 8** — TCO + Replace vs Keep (§13, §14) · **PHASE 9** — Utilization + optimisation (§15) · **PHASE 10** — What-If (§17) · **PHASE 11** — Executive intelligence (§18) · **PHASE 12** — Copilot + NL analytics (§19, §20) · **PHASE 13** — Real-time telematics exceptions (§22)

Profitability (§16) enters as an extension point in Phase 8 — **no revenue model exists, and I will not invent values.**

---

## 8. DEPENDENCIES

```
PHASE 0 ──► everything (mis-scoped rows and unresolved identity poison all downstream artefacts)
PHASE 1 ──► 3, 4, 5, 6, 11
PHASE 2 ──► 3 (no reliable delivery ⇒ no retry-safe actions)
PHASE 3 ──► 5 (nothing to verify without executed actions)
PHASE 4 ──► 11 (executive "top decisions" needs Opportunities)
PHASE 5 ──► 11 (ROI needs verified value)
PHASE 8 ──► 9, 10 (right-sizing and simulation need TCO)
PHASE 1 ──► 12 (copilot must cite normalised evidence)
Finding 2 decision ──► 3 (action ownership model)
```

---

## 9. RISKS

| Risk | Severity | Mitigation |
|---|---|---|
| Building on mis-scoped `AttentionItem` rows | **High** | Phase 0 first; adversarial tests per Phase F/H pattern |
| Plate-vs-`_id` silent mismatch in the closed loop | **High** | `VehicleIdentityResolver`; golden-file test crossing all three conventions |
| A third automation engine | **High** | Extend `RuleActionRegistry`; conformance test asserting no parallel registry |
| AI-triggered destructive actions | **High** | §9 approval gate; executors classified sensitive/non-sensitive; sensitive ⇒ `start_workflow` |
| Unscoped new aggregations | **High** | Every aggregation registered + adversarial test — this class has leaked twice |
| Ledger writes from unverified outcomes | **High** | Reuse existing baseline tiers; realised and modelled never summed |
| Workflow migration (Finding 2 option B) | Medium | Prefer the split recommendation |
| Aggregation performance on growing ledgers | Medium | Phase 0 indexes; verify with `explain()` |
| In-memory bus on multi-instance deploy | Medium | Phase 2 outbox; distributed bus if you deploy >1 instance |
| Scope creep across 13 phases | Medium | One phase per pass, `tsc` + full suite + build each time |
| Presenting models as facts | Medium | §14/§17 — label modelled vs realised in every UI |

---

## 10. RECOMMENDED FIRST IMPLEMENTATION

**Phase 0 — Foundation integrity.** Not the glamorous choice, and I want to be direct about why it beats starting at §6 as the directive suggests.

Phase 1 through 12 all write records that carry an `orgUnitId` and a vehicle reference. Right now one of those is provably assigned from the wrong source, and the other has three incompatible conventions across the exact modules the closed loop must join. Every phase built before that is fixed produces data that has to be re-derived afterwards — including Value Ledger entries, which are the financial artefact you would show a customer.

Phase 0 is also small: an upsert-time scope resolution, one resolver class, one index addendum, one duplicate service removed, three registry entries, and their tests. It is the cheapest phase in the plan and the only one that gets more expensive the longer it waits.

**Deliverable:** changed/new files only, zipped, with a changelog covering implemented / files changed / DB changes / API changes / UI changes / tests added and executed / how tenant isolation was verified / performance notes / `tsc` + test + build results / remaining gaps — per §32.

---

## DECISIONS I NEED FROM YOU

1. **Finding 2 — action ownership.** (A) org-level automation, (B) full org-unit migration, or my recommended split (org-level policy, org-unit action instances)?
2. **Approve Phase 0 first**, or do you want Phase 1 (§6 intelligence model) first as originally specified — accepting that some records will need re-deriving?
3. **Duplicate predictive maintenance** — is `modules/ai` or `modules/intelligence` authoritative? If you don't know, I'll diff them and recommend.
4. **`Anomaly` vs `AttentionItem`** — fold anomalies into the unified model, or keep separate with a documented reason?
5. **Revenue data (§16)** — does any revenue/billing source exist that I haven't found (`modules/billing` is organization-level and looks subscription-oriented, not trip revenue)? If not, I'll build the extension point only.
6. **Deployment topology** — single instance or multiple? Determines whether Phase 2 needs a distributed bus or just the outbox.
