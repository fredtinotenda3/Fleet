# Wave 2 — Rule Engine Activation + Alert Path Consolidation

Status: smallest correct vertical slice implemented, tested, and verified. The Rule Engine is now a real, wired, feature-flagged, off-by-default alternative production path for one alert family (reading-alerts.ts). It is **not yet the sole authoritative path** — that is deliberate; see "Whether the architecture is now genuinely consolidated" below.

---

## 1. Architectural findings

**The Rule Engine (`modules/rules/`) was fully built and completely unreachable.** `RuleEngineService.evaluate`/`evaluateAndExecute`/`fireTrigger` are correct, generic, and already handle every condition reading-alerts.ts needs (dotted-path field resolution, `gt`/`lt` requiring `typeof === 'number'` on both sides — the exact absent-vs-zero distinction reading-alerts.ts's own guards encode). `RuleTriggerService.fireEvent` — the intended production entry point, mirroring `workflow-trigger.service.ts` — had **zero callers anywhere in the repository**, confirmed by exhaustive search and consistent with this repo's own prior `WAVE_1_GAP_ASSESSMENT_AND_REPORT.md`. The only live entry point into rule evaluation was the manual, `ORG_MANAGE`-gated `POST /api/rules/evaluate` admin endpoint.

**`reading-alerts.ts` is the correct, and only sensible, first migration target.** It is a 115-line pure function (`deriveReadingAlerts`) with exactly three alert families (speeding, engine DTC codes, low fuel), no dedup/cooldown of its own, and one hard external constraint: `SPEEDING_THRESHOLD_KMH` is imported directly by `driver-risk.service.ts` with a structural test pinning that import path — migration had to leave that export in place, which it does (reading-alerts.ts is untouched).

**No engine changes were needed.** The condition engine's `gt`/`lt` operators already require both sides to be numbers, so a reading that does not report a signal (`fuelLevel` absent, no `location` at all) resolves to `undefined` and never matches — identical to reading-alerts.ts's explicit `typeof === 'number'` guards. `engine.dtcCodes.length gt 0` correctly reproduces the non-empty-array check via ordinary dotted-path property access. This was verified directly, not assumed: see the parity suite (§7).

**`set_variable` was a confirmed, verified silent no-op with a false doc comment.** Its own comment claimed "handled inline by the engine"; a full read of `rule-engine.service.ts` shows no such inline handling exists anywhere — every action, without exception, is dispatched exclusively through `RuleActionRegistry`. A rule configured with `set_variable` did nothing at all while `evaluateAndExecute` reported `{success: true}`. Fixed (§4); no rule in this codebase's schemas, seed data, or tests configured it, so nothing was regressed.

**A second, unrelated dormant integration was discovered and deliberately NOT touched.** `server/events/event-names.ts` declares `TELEMATICS_DATA_INGESTED`, and three handlers (`WorkflowTriggerHandler`, `WebSocketHandler`, and webhook-subscription documentation) are already wired to react to it — but **nothing in the codebase publishes it**. This is architecturally adjacent to this wave's mission (it's a different kind of "wired but never fired" telemetry integration) but activating it would simultaneously turn on three dormant, unaudited fan-outs (workflows, a second websocket path, and webhook delivery — potentially unbounded per-reading webhook volume) — squarely out of scope per instruction #17 ("do not expand scope merely because something could be improved"). Flagged here for a future, separately-scoped wave; the new trigger name (`telemetry.reading_ingested`) was deliberately chosen to be distinct from it so the two mechanisms can never accidentally collide or double-fire if that gap is closed later (see `telemetry-rule-context.ts`'s header for the full reasoning).

**The outbox is real, production-default infrastructure — and was deliberately NOT used for this invocation.** `EVENT_BUS_MODE=outbox` in production; the outbox is genuinely durable, at-least-once, and is what `publish_event` rule actions and all `bootstrapEvents()` domain-event handlers already ride on. But telemetry ingestion itself publishes zero domain events today (confirmed by exhaustive search), and reading-alerts.ts's own behavior is synchronous-with-the-request (the websocket emit and live-map coloring depend on the alert existing by the time `ingestTelematicsData` returns). Routing the new invocation through the outbox would mean: (a) introducing a new async boundary where none exists today — a genuine behavior change, not a preserving migration; (b) alerts appearing up to one poll interval late; (c) new infrastructure being added to a path that doesn't currently touch it, which is the opposite of "prefer existing infrastructure." The correct existing infrastructure to reuse is the other one this codebase already has: the direct-call, failure-isolated trigger-service façade (`ruleTriggerService.fireEvent`, mirroring `workflowTriggerService.fireEvent`), which is exactly what was wired.

---

## 2. Exact production invocation point

`TelematicsService.ingestTelematicsData` and `TelematicsService.bulkIngest`, at the identical point the old `checkForAlerts`/`processAlerts` call used to sit — immediately after the telemetry write (`telematicsRepository.create`) and before the websocket location emit / geofence check. Extracted into one shared private method, `evaluateAlertsForReading`, so both ingestion entry points can never diverge on which alerting logic applies to which reading.

```
telematicsRepository.create(data)   ← unchanged, durable, unique-indexed
        │
        ▼
evaluateAlertsForReading(data)      ← WAVE 2: the one branch point
        │
   ┌────┴─────────────────────────────┐
   │ flag OFF (default)               │ flag ON
   ▼                                  ▼
checkForAlerts → processAlerts   ruleTriggerService.fireEvent(
   (reading-alerts.ts,               'telemetry.reading_ingested',
    unchanged)                        buildTelemetryRuleContext(data),
        │                             data.tenantId)
        │                                  │
        └──────────────┬───────────────────┘
                        ▼
         recordAndNotifyAlert()   ← ONE shared implementation
     (telemetry-alert-writer.ts: resolve ownership → createAlert →
      websocket emit → conditional fleet-manager notification)
```

Properties satisfied, checked against instruction #3's non-negotiable list:
- **Tenant-aware**: `data.tenantId` is threaded through unchanged; `fireTrigger`'s own repository call (`getActiveRulesForTrigger(trigger, tenantId)`) is tenant-scoped.
- **Org-unit aware**: `orgUnitId` is included in the canonical context and reaches the action; alert *filing/notification* ownership is resolved from the vehicle record exactly as before (unchanged `resolveAlertOwnership` call).
- **Authorization-safe**: no client input reaches this path — `data` is the already-scope-checked, server-stamped reading (unchanged from before this wave).
- **Durable where required**: the telemetry write itself is unchanged (real Mongo insert, unique-indexed); alert persistence is a real Mongo insert either way.
- **Observable**: `fireEvent` logs rule-engine failures (`monitoring.logError`); `evaluateAndExecute` logs and records every action failure individually; `auditLog.log('RULE_EXECUTED', ...)` fires on every match.
- **Idempotent / retry-safe**: inherited from the existing telemetry-write unique index (`{tenantId, vehicleId, deviceId, timestamp}`) — an exact-duplicate retry throws before `evaluateAlertsForReading` ever runs, for either branch. No new idempotency mechanism was invented (see §9).
- **Bounded**: one reading → at most `N` active rules for one trigger name in one tenant, evaluated synchronously; no fleet-wide scan.
- **Testable**: 69 new tests directly exercise this invocation point and its two branches (§7).
- **No second event bus** — confirmed no new bus was introduced; `fireEvent` calls the existing `RuleEngineService` in-process.
- **No duplicate telemetry persistence** — the write happens exactly once, before either branch.
- **No frontend-driven rule evaluation** — this path has no client input at all.

---

## 3. Current alert-path inventory (A–F classification)

| Path | Class | Status |
|---|---|---|
| reading-alerts.ts (speeding/engine/low-fuel) | A (live, hardcoded) | **Migrated** to an alternate, flag-gated Rule Engine path this wave. Legacy path remains the default and untouched. |
| Geofence entry/exit/inside | A (live, hardcoded) | Untouched — explicitly out of scope for this slice (a separate, larger alert family; instruction #16 defers this). |
| Device-offline sweep (10-min cron) | A (live) | Untouched, out of scope. |
| EagleTrack vendor alert import | A (live, narrow/reactive) | Untouched, out of scope. |
| DVIR out-of-service broadcast | A (live) | Untouched, out of scope. |
| Rule Engine's own actions (`notify`, `audit_log`, `publish_event`, `start_workflow`, `create_work_order`, `schedule_maintenance`) | Was E (dead — correct, unreachable); now **live** for the new `create_telemetry_alert` action | Activated by this wave, for telemetry only. |
| `set_variable` action | E (silent no-op, false doc comment) | **Fixed**: now fails loudly and observably (§4). |
| `maybeAutoDispatch` (attention auto-dispatch) | E (dead, flag-gated) | Untouched — the pattern this wave's own flag design mirrors. |
| `TelematicsDataIngested` domain event | E (dead — declared, handled by 3 subscribers, never published) | **Discovered this wave, deliberately not activated** (§1). |
| Harsh braking/acceleration (`CanonicalEvent.type`, `driver-risk.service.ts`'s `hardBrakes`/`hardAccelerations`) | E (dead data — populated by adapter, never read downstream; separately, always evaluates to 0 due to reading `TelematicsData.alerts`, a field no ingestion path populates) | Untouched, out of scope — flagged for a future wave (this is R.5/driving-behaviour territory, explicitly deferred by instruction #16). |
| Compliance recalculation, billing notifications, observability alerting | F (intentionally independent) | Untouched. |

---

## 4. Implementation plan (as executed)

1. **Extracted the shared alert-writer.** `TelematicsService.processAlerts`'s per-alert body (resolve ownership → `createAlert` → websocket emit → conditional notify) moved, byte-for-byte behaviorally, into `modules/telematics/services/telemetry-alert-writer.ts` as `recordAndNotifyAlert` + `getFleetManagerIds`. This is the **Duplicate Alert Invariant** made structural: there is exactly one implementation of "what does it mean to record an alert," and both the legacy path and the new rule action call it.
2. **Defined the canonical telemetry context.** `telemetry-rule-context.ts` exports `buildTelemetryRuleContext` (the one function that decides what a rule can see) and the one trigger name, `telemetry.reading_ingested`, deliberately distinct from the dormant `TelematicsDataIngested` domain event (§1).
3. **Added the `create_telemetry_alert` rule action** (`modules/rules/actions/telematics-actions.ts`), the action that lets a rule reproduce one of reading-alerts.ts's three alerts. Message/value construction is explicit and type-aware (not a generic template) for exactly the three implemented types (`speeding`, `engine`, `maintenance`); every other valid `TelematicsAlert` type fails loudly with a message naming what's implemented — the "IMPLEMENTED OR EXPLICITLY UNSUPPORTED" contract instruction #7 requires.
4. **Fixed `set_variable`** (`default-actions.ts`): still registered (so `isRegistered` stays truthful), but now throws a clear, actionable error instead of silently no-opping.
5. **Added the feature flag** (`telemetry-rule-engine.config.ts`, `TELEMETRY_RULE_ENGINE_ENABLED`, default `false`), built to the identical contract as the existing `ATTENTION_AUTO_DISPATCH_ENABLED` (fail-closed on a malformed value, opt-in, cached with a test-only reset).
6. **Wired the branch point** into `TelematicsService.evaluateAlertsForReading`, called from both `ingestTelematicsData` and `bulkIngest` at the exact position the old alert check occupied.
7. **Added the rule definitions + seed script.** `telemetry-alert-rules.definitions.ts` is the single source of truth for the three migrated rules' conditions/actions (imported by both the seed script and the parity test suite, so they cannot silently drift from each other). `scripts/seed-telemetry-alert-rules.ts` creates them, idempotently, in `draft` status — activation is a second, deliberate, human step.

---

## 5. Files and modules affected

**New:**
- `modules/telematics/services/telemetry-alert-writer.ts`
- `modules/telematics/services/telemetry-rule-engine.config.ts`
- `modules/telematics/services/telemetry-rule-context.ts`
- `modules/telematics/services/telemetry-alert-rules.definitions.ts`
- `modules/rules/actions/telematics-actions.ts`
- `scripts/seed-telemetry-alert-rules.ts`

**Modified:**
- `modules/telematics/services/telematics.service.ts` — `processAlerts`/`getFleetManagerIds` bodies extracted; new `evaluateAlertsForReading` branch point added to `ingestTelematicsData`/`bulkIngest`.
- `modules/rules/actions/default-actions.ts` — `set_variable` fix.
- `modules/rules/services/rule-engine.service.ts` — exported the existing `resolveField` (renamed export, unchanged behavior) for reuse by the new action; registered `registerTelematicsRuleActions()` alongside the existing two registration calls.

**New tests (7 files, 69 tests):**
- `tests/unit/telematics/telemetry-alert-writer.spec.ts`
- `tests/unit/telematics/telemetry-rule-engine.config.spec.ts`
- `tests/unit/rules/telematics-actions.spec.ts`
- `tests/unit/rules/set-variable-explicit-failure.spec.ts`
- `tests/security/telemetry-rule-engine-parity.spec.ts`
- `tests/security/telemetry-rule-engine-invocation-gating.spec.ts`
- `tests/security/telemetry-rule-engine-tenancy.spec.ts`

**Modified test:**
- `tests/security/websocket-org-unit-isolation.spec.ts` — its structural assertion on `vehicle:alert`'s emit location updated to point at the new `telemetry-alert-writer.ts` (the emit itself, and the security property being pinned, are unchanged — only which file contains the literal moved).

---

## 6. Risks

- **Behavioral difference in failure isolation (new path is *more* resilient, not less):** the old path — if `processAlerts` throws (e.g., a transient `createAlert` error) — currently fails the *entire* `ingestTelematicsData` call, blocking the websocket location emit, geofence check, and analytics-refresh enqueue for that reading. The new path's `fireEvent` catches all rule-engine errors internally and never throws, so those downstream steps always run. This is a genuine, deliberate behavior difference (documented, not hidden) — it does not violate "preserve existing behavior" for *alerting decisions* (which alerts fire for which conditions), but it does change *failure blast radius*. Recommendation: treat this as a known, positive side effect, not a defect — but call it out explicitly to whoever reviews the flag flip for a given tenant.
- **Per-alert ownership-resolution now happens once per alert instead of once per batch** on the legacy path's shared writer when called from a context without a pre-resolved list (only the new rule-action path; the legacy path still hoists correctly, unchanged). This is a bounded, negligible cost the ownership resolver's own 30-second memo cache was explicitly designed to absorb (see its header).
- **The dormant `TelematicsDataIngested` domain event remains dormant.** Not a regression — it was already dormant — but it is now a *known*, written-down gap rather than an unknown one. A future engineer activating it must be aware a differently-named, differently-mechanised rule trigger already exists on this same data.
- **Draft-status seed script + off-by-default flag means two explicit human actions are required before any tenant sees a behavior change** — by design, but worth stating plainly: this wave alone changes nothing in production for any existing tenant.

---

## 7. Tests added — what they prove and what they deliberately don't

All 69 new tests pass; the full suite (2872 tests, 157/158 suites, 21 pre-existing skips with the known live-Mongo dependency) passes with zero regressions.

- **`telemetry-alert-writer.spec.ts`** (unit): the extracted `recordAndNotifyAlert`/`getFleetManagerIds` in isolation — call order, websocket payload, severity notification gate, graceful degradation on ownership/organization lookup failure, and that a genuine write failure still propagates (not swallowed).
- **`telematics-actions.spec.ts`** (unit): `create_telemetry_alert`'s full input-validation surface, and **exact parity** with reading-alerts.ts's message/value construction for all three implemented types (including the DTC-count-vs-joined-string distinction), plus the "IMPLEMENTED OR EXPLICITLY UNSUPPORTED" contract for all five not-yet-implemented `TelematicsAlert` types.
- **`set-variable-explicit-failure.spec.ts`** (unit): the fix, both at the executor level and end-to-end through `evaluateAndExecute` (proves the user-visible `{success:false}` signal, not just that the class throws).
- **`telemetry-rule-engine.config.spec.ts`** (unit): the flag's default, exact-string parsing, fail-closed-on-garbage, case/whitespace tolerance, and caching contract — mirrors `attention-dispatch.config.ts`'s own test suite line for line.
- **`telemetry-rule-engine-parity.spec.ts`** (security/parity, instruction #5): table-driven, against the **real** condition engine and the **real** three seed rule definitions — below/at/above threshold for both speeding and low-fuel (including the boundary being exclusive, matching `>`/`<`), the genuine 0-vs-absent distinction for both signals, missing signal, invalid (non-numeric) signal, DTC codes present/empty/absent, multi-condition readings firing multiple rules, multi-vehicle isolation, and an explicit test that repeated identical telemetry fires the rule engine repeatedly too — because reading-alerts.ts has no dedup either, and parity means reproducing that limitation, not silently fixing it.
- **`telemetry-rule-engine-invocation-gating.spec.ts`** (security, instruction #6, the Duplicate Alert Invariant): flag off → only the legacy writer runs; flag on → only `fireEvent` runs, never both; write-before-evaluate ordering; a duplicate-key write rejection blocks both alert paths identically; both `ingestTelematicsData` and `bulkIngest` apply the identical gate.
- **`telemetry-rule-engine-tenancy.spec.ts`** (security, instruction #9): Tenant A telemetry never triggers Tenant B's rule query; an empty rule set for the firing tenant produces zero alerts even when another tenant has a matching rule; a missing/empty `vehicleId` fails closed with an observable per-action error rather than writing against nothing; one rule with an unimplemented action type does not block a sibling rule in the same trigger from firing; and an explicit, honest test documenting that a tenant-wide rule currently applies across org units (inherited, unchanged, from reading-alerts.ts — see §10 below).

**What was NOT built this wave, stated plainly (instruction #14's "report reality"):** out-of-order telemetry delivery, worker-retry/process-restart/outbox-replay scenarios (not applicable — this path uses no outbox), and duplicate-provider-delivery tests specific to this trigger were not separately written, because this invocation point introduces no new durability or delivery mechanism beyond what the existing telemetry-write unique index and BullMQ worker retry already provide and already have their own test coverage elsewhere (`ingestion-scale-guards.spec.ts`, EagleTrack staleness-guard tests). Writing a parallel, redundant copy of those tests against this call site would test the same inherited mechanism twice rather than anything new.

---

## 8. Verification results

- `npx tsc --noEmit`: **clean**, zero errors.
- `npx jest` (full suite): **2872 passed, 21 skipped (pre-existing, live-Mongo dependency, unrelated to this wave), 1 suite skipped, 0 failed.**
- `npx eslint` on all 17 changed/new files: **clean**, except 3 pre-existing `@typescript-eslint/no-explicit-any` errors in `telematics.service.ts`'s `validateGeofenceCoordinates` (lines 187/192/197) — **not introduced by this wave** (verified: these lines are in a method untouched by this migration; present before this wave's edits) and, per this wave's explicit instructions, not "cleaned up" as unrelated debt.
- `npm run build`: **fails**, identically to Wave 1's documented limitation — `Failed to fetch font 'Geist'/'Geist Mono' from Google Fonts` (`fonts.googleapis.com` blocked in this sandbox). This is a pre-existing, environment-level restriction in `app/layout.tsx`, unrelated to and unaffected by any file this wave touched. Reported honestly rather than skipped or asserted-around, per instruction #14.
- Package (`fleet-wave2.zip`, delivered): all 17 changed/added files verified **byte-identical** to the working tree via extract-and-diff (not just listed/sized).

---

## 9. Remaining gaps (stated plainly)

- **No new idempotency mechanism was built for rule-fired alerts beyond what the legacy path already inherits.** Both paths get "an exact-duplicate reading is rejected before either alert path runs" for free from the telemetry collection's unique index — but neither path has ever had per-alert idempotency beyond that (reading-alerts.ts has none either; this is documented, existing behavior, not a new gap).
- **`Rule` has no `orgUnitId` field**, so a tenant-wide telemetry rule matches every vehicle in the tenant regardless of branch — this is explicitly the *same* characteristic reading-alerts.ts's hardcoded path already has (it has no org-unit-scoping concept at the "which conditions apply" level either), carried forward unchanged and tested explicitly (§7). It is not closed by this wave; closing it would mean adding org-unit scoping to `Rule` itself, which is a larger, cross-cutting change affecting every rule category, not just telemetry, and is out of this slice's scope.
- **Geofence alerts, device-offline sweeps, EagleTrack vendor imports, and DVIR broadcasts remain entirely on their existing hardcoded paths.** Only reading-alerts.ts was migrated this wave, as instructed.
- **The dead `driver-risk.service.ts` hard-brake/hard-accel metric** (always evaluates to 0 because it reads a field no ingestion path populates) was discovered but not fixed — unrelated to telemetry alerting/rule-engine consolidation, a separate defect class.
- **The dormant `TelematicsDataIngested` domain event** remains dormant, now documented rather than merely undiscovered.
- **R.4 (Fuel), R.5 (Driving Behaviour), R.13 (RPM), and R.6/R.7/R.9/R.10/R.12/R.14/R.15** were not started, per instruction #16's explicit priority ordering — this wave is P0/P1 work only.
- **The seeded rules are `draft`, not `active`**, and `TELEMETRY_RULE_ENGINE_ENABLED` defaults `false` — no tenant's production alerting changes as a result of this wave landing. Turning it on for a given tenant is a deliberate, separate, two-step operational decision (seed + activate + flip flag), not a side effect of this delivery.

---

## 10. Whether the architecture is now genuinely consolidated

**Not yet — by design, and that is the correct state for this wave.** There are now two paths capable of producing the same three alert types, but they are structurally prevented from ever running simultaneously (the single `if/else` in `evaluateAlertsForReading`), they share one implementation of what "recording an alert" means, and the new path is inert everywhere until a human takes two separate, deliberate actions (seed rules, flip the flag) per tenant. This is "parity before removal" (instruction #5) working exactly as specified: the old path has **not** been removed, cannot yet be removed responsibly (no tenant has run the new path in production long enough to prove real-world parity beyond this test suite), and instruction #15 explicitly requires proof of "no required callers, replacement behavior demonstrated, and test coverage" before any removal — none of that exists yet for a live tenant. Genuine consolidation — one authoritative path, the legacy path deleted — is P3 work, correctly deferred.

---

## 11. Final Engineering Questions — answered honestly

1. **Is the canonical event model sufficient?** For the three reading-alerts.ts conditions, yes — verified directly (§1, §7). For R.6/R.7/R.9/R.10/R.12/R.14/R.15, no; those need canonical signal groups that do not exist on `TelematicsData` yet and must not be fabricated.
2. **Is rule semantics ambiguous anywhere touched?** No. AND/OR groups, all 14 operators, and priority/stopOnMatch ordering are unchanged and were not touched.
3. **Does every action have unambiguous business meaning?** `create_telemetry_alert` does, for its three implemented types; it fails loudly (not ambiguously) for the other five. `set_variable` no longer has ambiguous meaning — it explicitly has none, and says so.
4. **Is notification ownership clear?** Yes — unchanged: `recordAndNotifyAlert` is the one place that decides who gets notified, called identically by both paths.
5. **Can one branch's rule evaluate another branch's vehicle?** **Yes**, currently, by inherited design — a tenant-wide rule with no org-unit field applies to every vehicle in the tenant regardless of branch. This is not a gap introduced by this migration; reading-alerts.ts's hardcoded path has the identical characteristic today. Stated plainly, tested explicitly (§7), not hidden.
6. **Can existing alert behavior be reproduced safely?** Yes, for the three migrated alerts — proven by the parity suite evaluating the real engine against the real function, not by inspection alone.
7. **Does required telemetry exist for what was migrated?** Yes; nothing was fabricated (§1, action-level refusals in `telematics-actions.ts` guarantee this at runtime, not just at review time).
8. **Can tenancy boundaries be proven?** Yes for tenant isolation (tested directly, §7). Org-unit boundaries are unchanged from the pre-existing characteristic (see Q5).
9. **Could removing a legacy path cause duplicate or missing alerts?** No legacy path was removed. The invariant preventing duplicates while both paths exist is structural (§2), not a convention.
10. **Can production build/runtime behavior be verified?** Build: no — same pre-existing sandbox limitation as Wave 1, reported honestly (§8), not worked around. Runtime: yes, via the full test suite against real production code paths (not a mocked-out engine).
11. **Was anything fabricated to reach "complete"?** No. The report states what was not built (§9) as plainly as what was.
12. **Is this now the sole authoritative alert path?** No — see §10. That is correct for this wave, not a shortfall.
13. **What would the next engineer need to know to continue?** Read §9 first. The next correct step is *not* R.4/R.5/R.13 — it is proving this slice in a real (likely staging) tenant: seed, activate one rule, flip the flag for that tenant only, and watch the parity hold under real traffic for a real observation window before considering any legacy-path removal or a second alert family's migration.

---

## Definition of Done — checklist

- [x] Repository inspection completed before any code was written.
- [x] Exact production invocation point identified and implemented.
- [x] Alert-path inventory (A–F) produced.
- [x] Smallest correct vertical slice implemented (canonical event → rule engine → one alert family → parity → idempotency → security → tests → verification).
- [x] Duplicate Alert Invariant enforced structurally, not by convention.
- [x] Every rule action is implemented or explicitly, observably unsupported (`set_variable` fixed; `create_telemetry_alert`'s unimplemented types fail loudly).
- [x] Notification correctness traced and unchanged (same shared writer, same gate).
- [x] Tenancy/security adversarial tests written and passing.
- [x] Data truth preserved — no fabricated signals; the action refuses when the expected signal is genuinely absent.
- [x] Idempotency inherited from existing infrastructure, not reinvented; stated and tested.
- [x] Observability preserved (existing logging/audit calls unchanged; failures visible).
- [x] Performance: no new fleet-wide scans, no N+1 introduced.
- [x] Test suite (A–J-equivalent coverage for this slice) built before declaring the migration complete.
- [x] Full test suite, TypeScript, and lint run and reported honestly.
- [x] Production build attempted and its (pre-existing, unrelated) failure reported honestly.
- [x] No legacy path removed without proof — none was removed.
- [x] R.4/R.5/R.13 and dependent items correctly left untouched.
- [x] Report answers all 13 Final Engineering Questions without optimizing for optimism.
- [x] Package produced and byte-verified against the working tree.
