# Phase 0 — Foundation Integrity: Completion Report

Scope: exactly the 7 items in the Phase 0 instruction, plus the required
adversarial testing and database/migration-safety work. No Phase 1 work
(Opportunities, Action Engine executors, Outcome Verification, TCO,
What-If, Executive Intelligence, Copilot) was started.

---

## 1. Executive Summary

All 7 Phase 0 items are complete, each backed by adversarial tests, not
just passing type-checks. While investigating the 7 named items, three
**additional real bugs of the same class** were found and fixed, because
they were direct evidence encountered while doing the assigned audits
(not scope creep — each is documented below with why fixing it was
in-bounds):

1. `driver_risk` attention items were about to be wired to the wrong
   collection entirely (`tbldrivers` instead of `organization.members`)
   — caught before shipping, via reading `driver-risk.service.ts`'s own
   code comments.
2. `VehicleRepository.getVehicleAnalytics()` (the "cost by vehicle"
   dashboard panel) had **no org-unit scoping at all**, and its only
   caller wasn't passing the `TenantContext` it otherwise threads
   through every other call in the same method — found while auditing
   `analytics` for scope registration (item 6).
3. `Anomaly.orgUnitId` was declared on the type and already used to
   *filter reads*, but nothing ever *set it at write time* — found
   while writing up the Anomaly-vs-AttentionItem decision (item 7). Same
   bug class as item 1, fixed by reusing the same `VehicleIdentityResolver`.

**Verified state:**
- `npx tsc --noEmit`: **0 errors** (baseline: 0 errors)
- `npx jest`: **37 suites / 460 tests, all passing** (baseline: 29
  suites / 382 tests) — **+8 suites, +78 tests**, zero regressions
- `npx next lint`: pre-existing errors only, in files this pass never
  touched (see section 17)
- `npx next build`: fails in this sandbox only because
  `fonts.googleapis.com` is unreachable (not in the sandbox's allowed
  network domains) — unrelated to any code change; see section 18

---

## 2. Problems Found

| # | Problem | Where |
|---|---|---|
| 1 | `AttentionItem.orgUnitId` was tagged with the requester's **active** org unit, not the target entity's true owner | `needsAttentionService.persistFeed()` |
| 2 | (confirmation item, not a defect) | — |
| 3 | Vehicle identity (plate ⇄ `_id`) resolved inconsistently across modules, with no ambiguity/missing-vehicle handling | codebase-wide |
| 4 | `tblallocationledger`, `tbldepreciationprofiles`, `tblglsubmissions` had zero index definitions | `infrastructure/database/` |
| 5 | Two predictive-maintenance implementations; one was dead code discarding its own output and using a now-rejected `'default'` tenant fallback | `modules/intelligence/services/predictive-maintenance.service.ts` |
| 6a | `ai`, `analytics`, `esg` unregistered in scope governance | `server/tenancy/module-scope.registry.ts` |
| 6b | **(found during 6a's audit)** `getVehicleAnalytics()` had no org-unit scoping; its caller dropped the context it had available | `vehicle.repository.ts`, `fleet-analytics.service.ts` |
| 7a | (decision item, not a defect on its own) | — |
| 7b | **(found during 7a's audit)** `Anomaly.orgUnitId` declared and read-filtered but never write-resolved | `anomaly-detection.service.ts` |
| — | **(found while implementing item 1)** `driver_risk`'s `entityId` is an `organization.members[].userId`, not a `tbldrivers._id` — a naive fix would have silently always failed closed | `driver-risk.service.ts` |
| — | Historical `AttentionItem` rows are contaminated (present-but-wrong `orgUnitId`, not merely missing) | `tblattentionitems` |

---

## 3. Problems Fixed

All of the above except the pure documentation/confirmation items (2, 7a
on their own) required code changes; all are fixed. See sections 6–13 for
each fix's specifics.

---

## 4. Exact Files Changed

```
infrastructure/database/indexes.ts
modules/ai/services/needs-attention.service.ts
modules/ai/types/needs-attention.types.ts
modules/analytics/services/fleet-analytics.service.ts
modules/attention/repositories/attention-item.repository.ts
modules/attention/types/attention-item.types.ts
modules/intelligence/services/anomaly-detection.service.ts
modules/vehicles/repositories/vehicle.repository.ts
package.json
server/events/handlers/intelligence/IntelligenceHandler.ts
server/tenancy/module-scope.registry.ts
tests/security/attention-items-persistence.spec.ts
tests/security/module-scope-conformance.spec.ts
```

## 5. New Files Created

```
infrastructure/database/indexes.finance-addendum.ts
modules/attention/services/attention-ownership.resolver.ts
modules/intelligence/services/ANOMALY_VS_ATTENTIONITEM.md
modules/intelligence/services/DECISIONS.md
modules/vehicles/services/vehicle-identity-resolver.service.ts
scripts/backfill-attention-item-ownership.ts
tests/security/anomaly-ownership.spec.ts
tests/security/attention-item-backfill.spec.ts
tests/security/attention-ownership-resolver.spec.ts
tests/security/finance-indexes.spec.ts
tests/security/predictive-maintenance-consolidation.spec.ts
tests/security/vehicle-analytics-scope.spec.ts
tests/security/vehicle-identity-resolver.spec.ts
```

**Deleted:** `modules/intelligence/services/predictive-maintenance.service.ts`
(see section 9; recorded in `DELETED_FILES.txt` since a zip can't
represent a deletion).

---

## 6. AttentionItem Ownership Fix (Item 1)

**Root cause.** `needsAttentionService.persistFeed()` called
`attentionItemRepository.upsertFeedItems(tenantId, items, context?.activeOrgUnitId)`
— one org unit applied to every row in a refresh batch, regardless of
which vehicle/driver each item was actually about.

**Fix.** `AttentionOwnershipResolver` (new,
`modules/attention/services/attention-ownership.resolver.ts`) is the
single, reusable place that resolves an item's true owning org unit,
dispatching on a small `AttentionOwnerTarget` discriminated union built
by each per-source reader in `needs-attention.service.ts`:

| Source | Target kind | Resolution |
|---|---|---|
| `predictive_maintenance`, `fuel_fraud` | `vehicle` | `VehicleIdentityResolver.resolveById` → vehicle's own `orgUnitId` |
| `driver_risk` | `organization-member` | `organization.members[].orgUnitId` (see below — **not** `tbldrivers`) |
| `expense_anomaly` | `expense` | expense record's own `orgUnitId` (already inherited from its vehicle at write time) |
| `compliance` | `org-unit-direct` | the compliance record's own `orgUnitId`, already in hand from the org-unit-scoped read — no extra lookup |
| `maintenance` (reminders + work orders) | `org-unit-direct` | the reminder/work-order's own `orgUnitId`, likewise already in hand |
| `fleet_health` | `none` | spans zero-or-more vehicles; no single owner — always fails closed |

**The `driver_risk` correction.** The obvious first mapping
(`entityId` → `tbldrivers._id`) is wrong. `driver-risk.service.ts`'s own
code comments confirm `DriverRiskScore.driverId` is actually
`OrganizationMember.userId`, sourced from `organization.members`, a
completely different collection than `tbldrivers`. The initial
implementation would have compiled and always fail-closed silently
(safe, but useless — every driver-risk item would never get an org
unit). Caught before finalizing by reading `driver-risk.service.ts`
closely rather than trusting the field name.

**`persistFeed()`** now resolves every item's org unit concurrently
(`Promise.all`) from its own target, and `AttentionItemRepository.upsertFeedItems`
takes a per-item `{item, orgUnitId}` pairing instead of one batch-wide
value.

**Fail-closed contract.** `resolveOrgUnitId()` never throws and never
guesses: no target, missing id, cross-tenant id, unbackfilled parent
entity, ambiguous plate, or a thrown lookup all resolve to `null` —
persisted as an unset `orgUnitId`, invisible to every org-unit-scoped
read (the existing, already-shipped fail-closed convention).

**Tests:** `tests/security/attention-ownership-resolver.spec.ts` (the
resolver itself, all target kinds, fail-closed cases),
`tests/security/attention-items-persistence.spec.ts` (rewritten for the
per-item signature; proves two items in the same batch persist with
*different* org units, and that `null`/`undefined` persists as `null`
rather than a guess).

---

## 7. Attention Scoping Confirmed (Item 2)

`server/tenancy/module-scope.registry.ts`'s `attention` entry flipped
`confirmed: false → true`, with its rationale rewritten to describe the
per-item resolution above instead of the old active-org-unit tagging.
`tests/security/module-scope-conformance.spec.ts`'s list of still-open
decisions updated to remove `attention`. No new intelligence/persistence
model was created — `AttentionItem` remains the single foundation, per
the explicit instruction.

---

## 8. VehicleIdentityResolver Design (Item 3)

New: `modules/vehicles/services/vehicle-identity-resolver.service.ts`.

- **Canonical persisted identity:** vehicle `_id`. **External/business
  identifier:** `license_plate` (mutable, not uniquely indexed today).
- `resolveById` / `resolveByPlate` — **tenant-scoped only**, deliberately
  not org-unit-scoped, because their purpose is discovering a vehicle's
  *own true org unit* (used by `AttentionOwnershipResolver` and the
  `Anomaly` fix), which may legitimately differ from the caller's active
  scope.
- `resolveByIdInScope` / `resolveByPlateInScope` — additionally
  org-unit-scoped, for a future caller acting on behalf of a specific
  user; a vehicle outside `accessibleOrgUnitIds` reports as `not_found`
  (never a distinguishable "exists but forbidden," which would leak
  existence to a scope-narrowed caller).
- Returns a discriminated `VehicleIdentityResult`
  (`resolved | not_found | ambiguous`) rather than a bare
  `Vehicle | null` — an ambiguous plate (two active vehicles sharing one
  plate) is reported distinctly and **never** resolved to "the first
  match."
- Reused by: `AttentionOwnershipResolver` (maintenance-item plate
  reconstruction in the migration script), `AnomalyDetectionService`
  (item 7's write-time fix).
- **Not** rolled out to every existing plate/`_id` lookup site in this
  pass, per the explicit "do not rewrite the entire application to use
  it yet" instruction — established as the canonical seam for Phase 1+
  to adopt incrementally.

**Tests:** `tests/security/vehicle-identity-resolver.spec.ts` — missing
vehicle, ambiguous plate (never picks one), cross-tenant id, org-unit
scoping, plate normalization.

---

## 9. Finance Indexes Added (Item 4)

New: `infrastructure/database/indexes.finance-addendum.ts`, wired into
`infrastructure/database/indexes.ts`'s merged `INDEXES` export.

| Collection | Index | Derived from |
|---|---|---|
| `tblallocationledger` | `{tenantId, vehicleId, postedAt: -1}` | `findByVehicleInScope` |
| `tblallocationledger` | `{tenantId, reversalOfPostingId}` (sparse) | `findReversalOf` |
| `tblallocationledger` | `{tenantId, vehicleId, periodStart}` | `getNetTotalsByCategory` |
| `tblallocationledger` | `{tenantId, glAccountCode, periodStart}` (sparse) | `getNetTotalsByGlAccount` |
| `tbldepreciationprofiles` | `{tenantId, vehicleId, createdAt: -1}` | `findByVehicleInScope` + `findAllInScope` |
| `tblglsubmissions` | `{tenantId, periodStart, submittedAt: -1}` | `findInPeriodInScope` |

Every index is derived directly from an actual filter/sort in the
corresponding repository (`modules/finance/repositories/*.ts`) — none
speculative, per the "do not invent random indexes" instruction. All
lead with `tenantId` (org-unit filtering elsewhere in this codebase uses
a variable-length `$in`, not a good leading-index field — matching the
existing `indexes.anomaly-addendum.ts` convention).

**Tests:** `tests/security/finance-indexes.spec.ts` — presence, correct
merge into `INDEXES`, `tenantId`-leading, name uniqueness, and one
targeted assertion per query pattern above.

---

## 10. Predictive-Maintenance Architectural Decision (Item 5)

Full write-up: `modules/intelligence/services/DECISIONS.md`.

**Decision: consolidated into `modules/ai/services/predictive-maintenance.service.ts`.**
The `modules/intelligence` copy was **not** a genuine second
implementation serving a different layer — it was dead weight:

- No org-unit scoping (reads the whole tenant's fleet unconditionally).
- Its only caller, `IntelligenceHandler`, **discarded the return value
  entirely** — never stored, read, or returned.
- Defaulted to a `'default'` tenant id on a missing
  `event.metadata.tenantId`, which `resolveTenantScope()` now
  hard-rejects — a latent, swallowed crash on every event that hit it.
- **A second, independent handler** (`AIPredictionTriggerHandler`,
  already existing) subscribes to the exact same events
  (`VehicleUpdated`/`TripCompleted`) and correctly calls the `modules/ai`
  implementation's `predictVehicle()` for the *specific* vehicle named
  by the event — with proper tenant resolution and a result that is
  actually persisted.

Deleted the file; removed `IntelligenceHandler`'s dead case (left a
detailed comment explaining why, mirroring this section, so a future
reader doesn't wonder why the case disappeared).

**Tests:** `tests/security/predictive-maintenance-consolidation.spec.ts`
— file no longer exists, authoritative file still exists, no source
file references the removed path, and `IntelligenceHandler` handles the
three former trigger events cleanly (no crash) with no dependency on the
removed service.

---

## 11. AttentionItem vs Anomaly Decision (Item 7)

Full write-up: `modules/intelligence/services/ANOMALY_VS_ATTENTIONITEM.md`.

**Decision: keep both. No third intelligence model created.**

| | `Anomaly` | `AttentionItem` |
|---|---|---|
| Nature | Incident log (append + day-bucketed dedup) | Live snapshot (upsert-in-place per refresh) |
| Lifecycle | `open → acknowledged / resolved / dismissed`, ops triage | `open → resolved`, writes a `ValueLedgerEntry` (financial capture) |
| Trigger | Event-driven (`FuelLogged`/`ExpenseCreated`) | Pull-driven (dashboard load recomputes the whole feed) |
| History retained | Yes | No — a cleared condition just stops being upserted |

Merging would force one of two incompatible write/lifecycle models onto
the other, losing real functionality either way (see the doc for the
concrete failure mode of each merge direction) — a genuine domain
difference, not incidental drift, so kept separate per the audit's own
"document the exact reason" instruction.

**Related, explicitly out of scope:** `AnomalyDetectionService`'s own
fuel/expense detection math is a *third, independent* detection
algorithm alongside the two `modules/ai` detectors that feed
`AttentionItem`. Unlike item 5, this is not dead code (it is the sole
implementation behind `/api/anomalies`), so consolidating the
*algorithms* (not the ownership bug below) is flagged for Phase 1
scoping, not silently left unmentioned.

---

## 12. AI / Analytics / ESG Scope Decisions (Item 6)

All three own **zero** MongoDB collections (confirmed by grepping for
`collectionName =` and any `*.repository.ts` under each module directory
— none exist). A new `ModuleScopeLevel: 'computed'` was added to the
registry schema specifically for this case (a module whose scoping
question is "does every read forward the caller's context" rather than
"which orgUnitId field do our rows carry").

| Module | Finding |
|---|---|
| `ai` | All five services accept and correctly narrow to an optional `TenantContext`; `ai.controller.ts` resolves one context per request and forwards it to all five. Verified by the existing `needs-attention`/`driver-risk`/`fuel-fraud`/`expense-anomaly`-scope test suites. `confirmed: true`. |
| `analytics` | **Found a real, live leak** (see below). Fixed. `confirmed: true`. |
| `esg` | Audited call-by-call: all three underlying reads (`fleetHealthService`, `driverRiskService`, `complianceService`) received `context`; none dropped. `confirmed: true`. |

**The `analytics` leak.** `VehicleRepository.getVehicleAnalytics()` (the
"cost by vehicle" panel behind `fleetAnalyticsService.getCostBreakdown()`)
had **no org-unit-scoping parameter at all**, unlike every sibling
`*Stats` method on the same repository — and its caller wasn't passing
`context` even though it threads context through every other call in
the same method. Net effect **before this fix**: a branch-restricted
caller's cost-breakdown-by-vehicle panel showed every vehicle in the
tenant, while the KPI/operational-metrics panels on the same dashboard,
right next to it, were correctly scoped. Fixed:
`getVehicleAnalytics` now accepts optional `context` and applies
`tenantScopeService.buildFilter` exactly like `getVehicleStats`;
`getCostBreakdown` now forwards it.

**Tests:** `tests/security/vehicle-analytics-scope.spec.ts` (the filter
is applied/omitted correctly per scope; `getCostBreakdown` forwards
context — a regression guard for the exact dropped-parameter bug found).
`tests/security/module-scope-conformance.spec.ts`'s hard-coded exclusion
list (`['tenancy', 'ai', 'analytics', 'esg']`) narrowed to just
`'tenancy'` (which implements scoping itself rather than having data of
its own to register).

---

## 13. Database / Schema / Migration Changes

**Schema:** `Anomaly` gained no new field (`orgUnitId` was already
declared via `anomaly.tenancy-addendum.ts`) — only its write path
changed. `AttentionItem` similarly gained no new field.

**Historical data audit:**

| Collection | Before this pass | Contamination shape |
|---|---|---|
| `tblattentionitems` | `orgUnitId` set on every row, but to the **requester's active org unit**, not the item's true owner | **Present and potentially wrong**, not missing |
| `tblanomalies` | `orgUnitId` **never set** by `persistBatch()` | Missing only, never wrong |

**Migration strategy chosen — and why the two collections needed
different tools:**

- **`tblanomalies`**: the existing, already-shipped
  `scripts/backfill-org-units.ts` (registry-driven, generic,
  fill-only-if-missing) is *already correct* for this case — `intelligence`
  was already registered with `orgUnitSource: 'vehicle'`, and Anomaly's
  `licensePlate` field matches that script's join. Run:
  `npm run tenancy:backfill -- --collections tblanomalies`. **No new
  script was written for this collection** — writing one would have
  been a second, overlapping migration mechanism for a job the existing
  one already does correctly.
- **`tblattentionitems`**: the existing script's fill-only-if-missing
  safety convention is *wrong* for this case, because the field is not
  missing, it's wrong. A dedicated script,
  **`scripts/backfill-attention-item-ownership.ts`** (new), was written:
  it **recomputes** every row's target `orgUnitId` from data the row
  itself stores (`source`/`entityId`/`entityLabel`), using the exact
  same `AttentionOwnershipResolver` the live code now uses, and writes
  only when the recomputed value differs from what's currently stored
  (which is what makes repeated runs idempotent). Two new resolver
  target kinds (`vehicle-by-plate`, `vehicle-or-driver`) were added
  specifically for reconstructing a target from fields a persisted row
  actually has, versus the richer context the live per-source readers
  have — see the resolver file for why both are still fail-closed
  (never guess between two possible matches).

**Safety properties of the new script** (mirroring the existing one's
conventions): dry-run by default, `--confirm` to write, per-tenant
scoped, every write audited to `tbltenant_repair_audit` in the same
shape the existing script uses (for forensic continuity), and a
self-contained `--revert <runId>` mode (does **not** depend on
`scripts/revert-tenant-run.ts`, which is hardcoded to `tenantId` reverts
only — see section 21 for this pre-existing narrowness).

**Not run against production data in this pass** — delivered as a
reviewable, dry-run-first tool per the "document rather than invent
ownership" instruction; an operator runs it once this PR is deployed.

**Tests:** `tests/security/attention-item-backfill.spec.ts` covers the
script's pure `reconstructTarget()` dispatch (the part testable without
a live Mongo instance); the resolution itself reuses
`AttentionOwnershipResolver`, already covered by section 6's tests.

---

## 14. API Changes

None. `AttentionItemRepository.upsertFeedItems`'s signature changed
(third positional `orgUnitId?: string` → an array of
`{item, orgUnitId}` pairs replacing the second parameter), but this is
an internal method with exactly one caller
(`needsAttentionService.persistFeed`), updated in the same commit — no
externally-facing API (HTTP route, controller contract) changed.
`VehicleRepository.getVehicleAnalytics` gained an optional trailing
parameter (backward compatible — every existing call site not passing
it is unaffected).

---

## 15. UI Changes

None, as expected for a foundation-integrity pass.

---

## 16. Tests Added

- Previous test count: **382** (29 suites)
- New test count: **460** (37 suites)
- **Passed: 460 / Failed: 0 / Skipped: 0**
- New suites (8): `attention-ownership-resolver.spec.ts`,
  `vehicle-identity-resolver.spec.ts`, `finance-indexes.spec.ts`,
  `predictive-maintenance-consolidation.spec.ts`, `anomaly-ownership.spec.ts`,
  `attention-item-backfill.spec.ts`, `vehicle-analytics-scope.spec.ts`
  — plus `attention-items-persistence.spec.ts` was substantially rewritten
  (not counted as new, but every test in it changed for the new
  per-item signature).
- Updated existing suite: `module-scope-conformance.spec.ts`.

---

## 17. Full Test Results

```
Test Suites: 37 passed, 37 total
Tests:       460 passed, 460 total
Snapshots:   0 total
```

---

## 18. TypeScript Result

```
npx tsc --noEmit
(no output — 0 errors)
```

---

## 19. Build Result

`npx next build` fails in this sandbox: `Failed to fetch font 'Geist'` /
`'Geist Mono'` from `fonts.googleapis.com`. This is a network-egress
restriction of the execution sandbox this pass ran in
(`fonts.googleapis.com` is not in its allowed outbound domain list) —
**not a code defect**. `tsc --noEmit` (which does the actual type/module
resolution work `next build` also depends on) is clean, and every
runtime code path touched by this pass is covered by the passing Jest
suite. Recommend re-running `next build` in an environment with normal
network access before merge, as a final confirmation this sandbox
cannot provide.

**Lint:** `npx next lint` reports pre-existing errors, all in files this
pass never touched (`app/api/observability/summary/route.ts`,
`app/api/organizations/[id]/members/route.ts`,
`app/api/version/[version]/route.ts`, `app/api/version/route.ts`,
`app/api/workflows/[id]/route.ts`,
`app/api/workflows/instances/[id]/steps/[stepId]/route.ts`,
`app/api/workflows/process-timeouts/route.ts`, `lib/authOptions.ts`,
`lib/import-export.ts`, `lib/sso-provider.factory.ts`,
`lib/updateReminderStatuses.ts`) — confirmed by diffing this pass's
changed-file list against the lint output; zero overlap. Not fixed, per
the "do not perform unrelated refactoring" instruction.

---

## 20. Tenant Isolation Verification

Every new/changed lookup routes through a tenant-scoped repository
method (`findById(id, tenantId)`, `findByLicensePlates(plates, tenantId)`,
etc.) — a same-shaped id/plate belonging to a different tenant simply
does not match, by construction of `BaseRepository`'s existing tenant
filter, not a check re-implemented in this pass. Explicitly adversarial
tests:

- `vehicle-identity-resolver.spec.ts`: a plate/id belonging to another
  tenant never resolves.
- `anomaly-ownership.spec.ts`: "never resolves a vehicle belonging to a
  different tenant" — a vehicle seeded under a different `tenantId`
  with the *same* plate an anomaly names does not contribute its
  `orgUnitId`.
- `attention-ownership-resolver.spec.ts`: cross-tenant id resolution
  fails for every target kind.

---

## 21. Org-Unit Isolation Verification

- `attention-items-persistence.spec.ts`: two items in the *same batch*
  persist with *different* org units (the core Phase 0 item-1 property).
- `anomaly-ownership.spec.ts`: same property for `Anomaly`, plus
  adversarial cases — unbackfilled vehicle, vehicle not found, ambiguous
  plate (two vehicles sharing one plate) — all fail closed
  (`orgUnitId: undefined`), never guessed.
- `vehicle-analytics-scope.spec.ts`: a scope-restricted caller's
  cost-breakdown query carries an `orgUnitId: {$in: [...]}` predicate;
  an org-wide caller's does not.
- `vehicle-identity-resolver.spec.ts`: org-unit-scoped resolution
  reports a vehicle outside `accessibleOrgUnitIds` as `not_found`
  (never a distinguishable "forbidden," which would leak existence).

**A known, pre-existing, out-of-scope gap surfaced but not fixed:**
`revert-tenant-run.ts` (the generic rollback tool `backfill-org-units.ts`
points operators to) is hardcoded to revert only `tenantId` changes
(`current.tenantId === e.after`) — it would silently do nothing useful
against an `orgUnitId` backfill run, despite that script's own comment
suggesting it as the rollback path. This predates Phase 0 and is
unrelated to any of the 7 items; flagged here rather than silently
patched (would be unrelated refactoring) or silently ignored. The new
`backfill-attention-item-ownership.ts` script avoids depending on it by
shipping its own self-contained `--revert`.

---

## 22. Performance / Index Verification

Static verification only (no live Mongo instance in this environment):
every new finance index is present in the merged `INDEXES` export
(`finance-indexes.spec.ts`), leads with `tenantId`, and has no name
collision with any pre-existing index. Each index's shape was derived
directly from reading the actual repository query it serves (section
9's table). An `EXPLAIN`-plan confirmation against a real database is
recommended before merge, as this environment cannot provide one.

---

## 23. Remaining Risks

1. **`getVehicleAnalytics` was one instance of a pattern** ("aggregate
   endpoint forgotten while sibling list/stat endpoints are scoped").
   This pass fixed the one instance found while auditing `analytics`
   specifically for item 6 — it was not a general sweep of every
   aggregation in the codebase, which was out of scope for Phase 0.
2. **`AttentionItem` migration is not self-running.** The new
   `backfill-attention-item-ownership.ts` is delivered dry-run-first and
   must be explicitly run (`--confirm`) post-deploy to correct
   historical rows; until then, a historical row keeps its old
   (possibly wrong) `orgUnitId`, though it also self-heals the next time
   its underlying condition is still true and the feed refreshes for
   that tenant (every dashboard load re-resolves and overwrites
   `orgUnitId` unconditionally).
3. **`revert-tenant-run.ts`'s narrowness** (section 21) predates this
   pass and remains unfixed.
4. **`AnomalyDetectionService`'s own detection algorithms** duplicate,
   without being identical to, the `modules/ai` fuel-fraud/expense-
   anomaly detectors (section 11) — a Phase 1+ product decision, not
   fixed here.
5. **Build verification is incomplete** in this environment (section
   19) — `next build` should be re-run with normal network access
   before merge.

---

## 24. Exact Recommendation for Phase 1

1. **Before anything else:** run `npm run tenancy:backfill -- --collections tblanomalies`
   and `npx tsx scripts/backfill-attention-item-ownership.ts --confirm`
   (each dry-run first) against the real database, and re-run
   `next build` with normal network access, to close out items 23.2 and
   23.5 above.
2. Phase 1 work (Opportunities, Action Engine executors, Outcome
   Verification, TCO, What-If, Executive Intelligence, Copilot) can now
   build on `AttentionItem` with confidence its `orgUnitId` reflects the
   item's true owner, per the explicit architectural rule that
   `RuleActionRegistry` remains the Action Engine seam and
   `WorkflowEngine` remains the workflow seam — neither was touched or
   duplicated in this pass.
3. Scope the `AnomalyDetectionService`-vs-`modules/ai` detector-algorithm
   duplication (section 11) as an early Phase 1 product decision, before
   any feature builds a dependency on either surface specifically.
4. Fix `revert-tenant-run.ts`'s `tenantId`-only narrowness (section 21)
   as a small, standalone hardening item — unrelated to Phase 1 feature
   work, but worth closing before it's needed under pressure.
