# Fleet Operating Intelligence Platform — Final Completion Report

**Date:** 2026-09-10 · **Verification:** `tsc --noEmit` clean · **137 suites / 2610 tests passing, 21 skipped, 0 failures** · `next build` 229/229 static pages

---

## 1. Executive Summary

This round completed the operational-polish and real-world-readiness pass. Work fell into four bodies, in descending order of consequence.

**A hostile security review found seven exploitable defects, all now fixed and pinned by regression tests.** One was critical: the JWT signing secret fell back to a literal published in this repository, and the production guard that was supposed to prevent it printed `FATAL: … Refusing to rely on default secrets` and then signed anyway. Anyone holding this source could mint a `super_admin` token and read and write every tenant. Three more were cross-tenant or cross-branch data leaks reachable by an ordinary tenant user, and they shared one root cause worth naming: **a capability check was reused as a data-scoping check.** `AuthContext.isSuperAdmin` is a deprecated alias of `canBypassRbac`, which is `true` for `ORGANIZATION_OWNER` — a self-service role. Its own declaration says *"Never use for data scoping."* Three controllers did exactly that. A codebase-wide conformance test now prevents a fourth.

**The empty-organization audit found the same defect eleven times, in two shapes.** *Fabricated verdicts* — a metric computed over nothing and rendered as a measurement: a red `0/100` fleet-health score, a green `0.0%` maintenance completion rate, and a `60/100` composite ESG score printed into a disclosure PDF whose three inputs were all invented. *Unearned reassurance* — an empty subsystem reported as a healthy one: *"your fleet is up to date"*, *"your fleet is in good shape"*, and a green tick enumerating five subsystems as checked and clear, all shown to organisations with no vehicles at all. Taken together they told a brand-new customer, on their first login, that seven subsystems had been verified and everything was fine — which is both false and precisely why nothing prompted them to set anything up. Compounding it, the setup checklist that *would* have prompted them was mounted only on the dashboard the founding account never sees.

**The named live issue — a driver assigned to a fuel log appearing as "Unassigned" in the Fuel Cost by Driver chart — was traced to its root cause and fixed** (this was completed in the earlier part of this session; §4 records it in full). It was not a chart bug. `driver_id` was absent from the zod schema, and a plain `z.object` silently strips undeclared keys, so the field never reached the database. The same strip also broke the spreadsheet importer's driver-name resolution and made existing attributions uncorrectable.

**A customer-readiness review across eight personas found the product broadly complete for six of them and structurally incomplete for two.** Two last-mile dead-ends were closed here — the workshop could never record parts or labour, and a tenant IT admin had no reachable route to their own API keys. The larger gaps (a Compliance persona with six live routes and no UI at all; inventory, procurement and vendor modules that are empty scaffolds) are features, not fixes, and are documented honestly in §11 rather than half-built.

**Nothing was fabricated to make a screen look finished.** Where a figure could not be measured it is `null` and renders as "Not measured"; where a request failed it says so instead of reporting zero; where a capability does not exist it is listed in §11 rather than stubbed.

---

## 2. Bugs Fixed

### Security (all verified exploitable before fixing)

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | **CRITICAL** | `token.service.ts` and `edge-token-verify.ts` both resolved `process.env.NEXTAUTH_SECRET \|\| 'default-secret-change-in-production'`. The production guard logged and continued. Forging a `super_admin` token grants `isPlatformAdmin`, which every repository treats as "skip tenant filtering". | New `infrastructure/security/jwt-secrets.ts` — one edge-safe resolver that **throws** on unset, published-placeholder, or under-24-character secrets, in every environment. Both runtimes use it. |
| 2 | HIGH | `audit-log.controller.ts:48,63` scoped on `isSuperAdmin`, so any `ORGANIZATION_OWNER` could pass `?tenantId=<victim-slug>` and read another organisation's entire audit ledger. | Scopes on `isPlatformAdmin` (SUPER_ADMIN only). |
| 3 | HIGH | `threat-detection.controller.ts:23,37` — same flag, but the fallback was `undefined`, and both repositories apply the tenant predicate only when truthy. An org owner did not even have to name a target: they got **every** tenant's failed logins, brute-force detections and locked accounts. | Scopes on `isPlatformAdmin`. |
| 4 | HIGH | Report exports ran **organization-wide**. The controller resolved a `TenantContext` correctly; `generate()` accepted it as a parameter it never read. Generation happens in a BullMQ worker, so the query engine received `undefined` and `if (!context) return {}` widened it. A branch manager's on-screen report was scoped; the file they downloaded was not. The scheduled path was worse — its output is emailed. | The context cannot cross a queue, but the *scope decision* can: `requestedOrgUnitIds` is frozen onto the execution record and onto the schedule payload, and rehydrated in the worker. **Fails closed** (`[]`, not `null`) on a record written before the field existed. |
| 5 | HIGH | `/api/vehicles/analytics` had no org-unit scope (the repository accepted a context; the CQRS path between had no parameter to carry one), **and** its two `$lookup` sub-pipelines joined on `license_plate` alone. A sub-pipeline is a fresh query over the whole joined collection; the outer `$match` does not reach into it. Plates are not globally unique — and an attacker can simply create a colliding one. | Context threaded through query → handler → service → controller. Tenant **and** org-unit predicates applied inside every sub-pipeline. Same fix applied to the meter-log join and, as defence in depth, the two trip-cost joins. |
| 6 | HIGH | The **entire work-orders module** was org-unit-unscoped except `create`. A workshop manager scoped to one workshop could list every branch's job queue with costs, cancel another branch's work orders, and consume another branch's spare-part stock. The scoped repository query existed and only the attention queue used it. | Controller resolves a `TenantContext` on all seven methods; list uses `getFilteredInScope`; a shared `assertInScope` guards all five by-id operations — **before** `consumeParts` moves stock. Returns **not-found**, never forbidden. |
| 7 | MEDIUM | `orgUnitId` was on `UpdateVehicleHandler`'s `ALLOWED_FIELDS` and copied straight from the request body. Create routes the same field through `resolveCreationOrgUnitId`; update had no equivalent. A branch manager could move a vehicle and its whole cost history into a branch they cannot see. | Update reuses the **same resolver** as create, applied only when the field is present. |

### Honest metrics

- `fleet-health.service.ts` — `Math.round(sum / Math.max(1, vehicleScores.length))` returned **0** with `success: true` for an empty fleet. Three consumers rendered it as a red `0/100`, a 5xl red `0%`, and a red progress bar. Now `null`; all three branch on it.
- `esg-export.service.ts` — the composite score was `fleetHealth 0 × 0.4 + compliance 100 × 0.3 + safety 100 × 0.3 = 60/100`, printed into an ESG disclosure PDF. **All three inputs were invented**: two "perfect" scores for populations of zero, one worst-possible score for a fleet that does not exist. Now each component contributes only when measured, weights renormalise across those, `excludedComponents` and the methodology sentence name what was left out, and the answer is `null` when nothing is measurable.
- `maintenance.repository.ts` — `completionRate: 0` and `averageCompletionDays: 0` for a fleet with no records. Zero days does not mean "no data"; it means "completed on the day it was due". Both now `null`.
- `fleet-analytics.service.ts` — `averageCostPerVehicle` and `vehicleUtilizationRate` divided by a vehicle count and fell back to `0`. Both now `null`.

### Empty-state honesty

- `GetStartedPanel` was mounted only in `FleetDashboardPage`, but `dashboard/page.tsx` routes `ORG_MANAGE` holders to `OrganizationDashboardPage` — and those are exactly the roles holding all four of the checklist's anchor permissions. **The setup checklist was unreachable by the only accounts able to complete it.** Now mounted on both.
- Five surfaces congratulated organisations with no fleet; all now derive their copy from one table gated on whether any vehicle exists (§8).
- `KPIsWidget` and `CommandCentrePage` painted a `0` green unconditionally. Green is now earned only when a fleet exists for the zero to be about.
- `OverviewStatsGrid` showed *"All invitations resolved"* to an organisation that has never sent one.

### Failure states

- `VehicleStatsCards` never read `isError` and used `data?.x ?? 0`, printing four confident zeroes — including a green *"Active: 0"* — over a backend outage, directly above the page's own correct empty state.
- `MaintenanceStatsCards` swallowed a failed request into the loading branch: a permanent shimmer.
- `OverviewStatsGrid` / `UsageCard` did the same on the organisation dashboard.
- **37 chart components** shared `if (error || !data || data.length === 0)` and rendered one sentence for both. *"No data available"* over a 500 is a claim about the customer's data made on the strength of a failed request — an operator reads "no trips in this range" and goes looking for a broken telematics feed. Error and empty now render differently everywhere.

### Customer-readiness dead-ends

- **Workshop costing** — `POST /api/workorders/[id]/parts` and `.../labor` were live, `workOrdersApi.consumeParts`/`.recordLabor` were implemented, `WorkOrderService` moved real inventory behind them, and **nothing called any of it**. The Costs card's Parts, Labor and Total lines were permanently zero for every work order the product had ever created, and the parts list rendered raw 24-character ObjectIds. Closed (§8).
- **API keys unreachable** — the sidebar pointed at `/organizations/advanced?tab=plugins`: a page that ignored the tab parameter *and* contains no API-key UI on any tab. The real UI was gated on `PLATFORM_VIEW`, which `PLATFORM_ONLY_PERMISSIONS` strips from every tenant role. A tenant admin holding `API_KEY_MANAGE` had no route to their own keys.
- **`?tab=` ignored** — `ORGANIZATION_ROUTES.advanced` declares deep links for all five tabs; the page initialised `useState('feature-flags')` and never read `searchParams`. All five links silently landed on Feature flags.

---

## 3. Operational Connections Fixed

| Connection | Before | After |
|---|---|---|
| Request → report worker | `TenantContext` resolved at the edge, discarded one call later; worker ran org-wide | Scope frozen onto the execution record and the schedule payload, rehydrated in the worker, fail-closed on absence |
| Controller → CQRS → repository (vehicle analytics) | Repository accepted a context; nothing between could supply one | `context` carried on the query object, forwarded by the handler |
| Work-order controller → service → repository | Bare `tenantId`; the scoped repository query existed and was unused by the API | Full context on every method; `getFilteredInScope` on list; `assertInScope` on all five by-id paths |
| Vehicle update → org-unit authority | Create used `resolveCreationOrgUnitId`; update bypassed it entirely | Update reuses the same resolver, so the two cannot disagree |
| Node signer ↔ Edge verifier | Two files, same published literal, one guard between them that did nothing | One edge-safe resolver, used by both, that throws |
| `dashboardKeys` | Tuple hand-copied into `useSetupProgress`; a duplicate stops being a cache hit the moment the original changes | Exported and reused by `useSetupProgress` and the new `useFleetPresence` |
| Work order → inventory | Routes and service existed; no caller | Mutation hooks + two dialogs; consuming parts invalidates the parts catalogue it read from |

---

## 4. Fuel Driver Chart — Root Cause and Fix

**Symptom:** a driver assigned to a fuel log appeared as *"Unassigned"* in the Fuel Cost by Driver chart, while Vehicle Detail → Driver assigned a driver correctly.

**Root cause — not in the chart.** `driver_id` was absent from `fuelLogBaseSchema` in `shared/validations/fuel.schema.ts`. A plain `z.object` **strips undeclared keys**, so the field was discarded during validation and never reached the database. The chart was reporting the data faithfully; the data was never written. This was proven at runtime before anything was changed. Two consequences beyond the chart: the spreadsheet importer's driver-name resolution was silently dead, and existing attributions were **uncorrectable** — the update path stripped the field too.

This was the **third instance of the same class** in this codebase (drivers' `orgUnitId` was the first two), which is why the fix included a schema-conformance test rather than only the one-line addition.

**Fix:**
- `driver_id` declared on `fuelLogBaseSchema` and `fuelFiltersSchema`.
- New `driverWriteResolver` (mirroring `vehicleWriteResolver`) resolves and **org-unit scope-checks** the driver on write. Status is deliberately not a gate — a suspended driver can still be named on a historical record.
- `update-fuel-log.handler.ts` gained an explicit `CLEARABLE_FIELDS` set so `''`/`null` clears an attribution rather than being ignored — without it, a wrong driver could never be removed.
- `FuelLoggedEvent` carries `driver_id`, so downstream allocation posting sees it.
- `create-trip` / `update-trip` handlers switched to the same resolver (a third scope gap found while fixing this one).

**Historical correctness preserved, as required.** The chart attributes a fuel log to **the driver on the fuel log**, never to the vehicle's current driver. `fuelLog.driver_id === null` renders as *Unassigned* and stays that way; no retroactive assignment happens anywhere. `shared/types/fuel.types.ts` carries a comment stating this so the next person does not "improve" it.

**Regression tests:** `tests/security/fuel-driver-attribution.spec.ts` (13 tests), proven by re-injecting the original defect and confirming they fail.

---

## 5. Vehicle Detail Page

Completed earlier in this session and unchanged by this round:

- **`VehicleQuickActions`** — five modals (fuel, trip, maintenance, expense, work order), lazy-loaded via `next/dynamic({ssr:false})`, each gated on the permission its endpoint actually enforces. Notably `Permission.MAINTENANCE_CREATE`, which no frontend helper had checked before.
- **`VehicleActivityTimeline`** — merges six sources into one chronology, names any source that failed rather than silently omitting it, and **excludes and counts** undated records rather than guessing a date.
- **`vehicle-timeline.ts`** — the merge and humanising logic as pure functions (jest here has no jsdom, so a decision inside JSX cannot be tested). `DatedRecord = object` plus a `field()` accessor, deliberately: a cast at the call site is exactly what hid the fuel `driver_id` bug.
- Controlled tabs, a quick-actions row, and a Recent activity card with per-module history links.
- `WorkOrderListPage`'s create button — previously a dead `onCreate` — wired to the new `WorkOrderModal`.

---

## 6. Trip Playback

Completed earlier in this session:

- **`playback.ts`** (pure) — `frameAtOffset` clamps at both ends and **never extrapolates**; speed and heading are deliberately not blended between samples, because an interpolated speed is a number nobody measured. Binary-search `lastIndexAtOrBefore`, plus `playbackRange`, `playbackPath`, `formatElapsed`, `advanceOffset` and typed empty-reason copy.
- **`TripPlaybackMap`** — `L.divIcon` markers (default icon URLs break under bundling) with colour as a `style` declaration, never an SVG presentation attribute; `FitRouteOnce` and `KeepMarkerVisible`.
- **`TripPlaybackPanel`** — dynamic import `ssr:false`, an rAF loop driven by real elapsed time, and a native `<input type="range">` because the shared `Slider` renders two thumbs for a scalar value.
- 19 unit tests.

---

## 7. Backend Changes

**Security**
- `infrastructure/security/jwt-secrets.ts` (new) — the single, edge-safe secret resolver.
- `infrastructure/security/token.service.ts`, `edge-token-verify.ts` — both delegate to it.
- `modules/security/controllers/audit-log.controller.ts`, `threat-detection.controller.ts` — `isPlatformAdmin` for all data scoping.

**Scope**
- `modules/workorders/controllers/workorder.controller.ts`, `services/workorder.service.ts` — full context, `assertInScope`, `listInScope`.
- `modules/vehicles/repositories/vehicle.repository.ts` — tenant + org-unit predicates inside three `$lookup` sub-pipelines.
- `modules/trips/repositories/trip.repository.ts` — tenant predicate inside two sub-pipelines.
- `modules/vehicles/queries/get-vehicle-analytics.query.ts` + handler + `vehicle-query.service.ts` + controller — context threaded end to end.
- `modules/vehicles/controllers/vehicle.controller.ts` — `orgUnitId` on update routed through `resolveCreationOrgUnitId`.

**Reporting**
- `types/report-execution.types.ts` — `requestedOrgUnitIds?: string[] | null`.
- `services/report-execution.service.ts` — freezes the scope, `rehydrateScope`, fail-closed default.
- `services/report-scheduler.service.ts`, `workers/report-execution.worker.ts`, `report-definition.controller.ts`, `app/api/reports/schedule/route.ts` — creator scope frozen onto the job.

**Honest metrics**
- `modules/ai/services/fleet-health.service.ts`, `types/ai.types.ts` — `overallScore: number | null`.
- `modules/esg/services/esg-export.service.ts`, `types/esg-export.types.ts`, `generators/esg-pdf.generator.ts` — renormalised composite with disclosed exclusions.
- `modules/maintenance/repositories/maintenance.repository.ts`, `shared/types/maintenance.types.ts` — nullable completion figures.
- `modules/analytics/services/fleet-analytics.service.ts` — nullable per-vehicle metrics.

**Config**
- `docker-compose.yml`, `.github/workflows/ci.yml` — `REFRESH_TOKEN_SECRET` added; the app now refuses to start without it.

---

## 8. Frontend Changes

**New shared primitives**
- `frontend/modules/onboarding/utils/empty-state-copy.ts` — one table mapping (subject × fleet-presence) to honest copy, with an explicit `unknown` state. Pure, because jest here runs `testEnvironment: 'node'` and copy this consequential is a decision that must be testable.
- `frontend/modules/onboarding/hooks/useFleetPresence.ts` — the one extra fact every empty state needs. Reuses `dashboardKeys.vehicleStats` and its exact `queryFn`, so on the dashboard and command centre it is a cache read, not a request. **Fails to `unknown`, never to `empty`** — reading a failed count as "no vehicles" would tell a customer with 400 trucks to add their first one.
- `frontend/shared/ui/ChartLoadError.tsx` — the error half of the 37-chart split. `role="status"`, not `alert`: several can appear on one screen and a chart that failed to load is not an interruption (WCAG 2.2 SC 4.1.3).

**Call sites**
- `OrganizationDashboardPage` — `GetStartedPanel` mounted, above the stats grid; `isError` threaded to both stat components.
- `MaintenanceWidget`, `NeedsAttentionWidget`, `AttentionQueueList` — copy from the shared table, `useFleetPresence`, a real next step on an empty organisation.
- `KPIsWidget`, `CommandCentrePage` — `zeroTone` gating.
- `VehicleStatsCards`, `MaintenanceStatsCards`, `OverviewStatsGrid`, `UsageCard` — `isError` read; `?? 0` replaced with `?? null`.
- `shared/ui/cards/StatsCard.tsx`, `StatisticCards.tsx` — `error`, `errorMessage` and `emptyValue` forwarded to `MetricCard`, which had supported them all along. This unlocked the fix at 26 call sites that were structurally unable to distinguish a failure from a zero, however carefully written.
- `AIRecommendationsWidget`, `FleetHealthGauge`, `AIReports`, `AnalyticsOverview` — null-score branches.
- 37 chart components — error split from empty.

**Workshop costing (new)**
- `frontend/modules/inventory/{types,services,hooks}` — the first real content in an empty scaffold, deliberately partial: a read-only spare-parts client and a name resolver, nothing more. **No write verb**: stock moves through the work order, which is the single writer of consumption movements and the only path that also recalculates job cost.
- `useConsumeParts`, `useRecordLabor` — mutation hooks; consuming parts invalidates the catalogue it read from.
- `ConsumePartsDialog` — a picker (never a free-text part id), stock-capped quantity, and the line cost shown **before** submitting. Distinguishes "couldn't load the catalogue" from "nothing in stock".
- `RecordLaborDialog` — the endpoint **replaces** rather than accumulates, so the wording, prefill and button all say replace; the new job total is previewed. The hourly rate is **not defaulted to a constant** — the platform records no labour rate, and inventing one would put a fabricated number into a customer's job costing.
- `WorkOrderDetailPage` — both dialogs wired, gated on `WORKORDER_MANAGE` (exactly what the routes enforce) and on the statuses the service accepts; parts resolved to names, falling back to the id rather than a guess.

**Routing**
- `app/(protected)/organizations/api-keys/page.tsx` (new) — a tenant-reachable route to the existing, already tenant-scoped API-key UI. `/platform-admin/api-keys` deliberately kept.
- `OrganizationAdvancedPage` — reads `?tab=` and writes it back with `router.replace({scroll:false})`, so a tab is bookmarkable and Back does not undo tab changes.

---

## 9. Documentation

Produced across this session and included in the package:

- **`ROLE_RESPONSIBILITY_MATRIX.md`** — generated by querying `permissionService.hasPermission` for all 117 permissions × 14 roles. Not hand-written, so it cannot drift from the code.
- **`DATA_FLOW_EXAMPLES.md`** — seven end-to-end traces (fuel entry, telemetry → trip → cost/km, work order, driver assignment, attention → value, notification), plus §7 documenting the unconsumed real-time layer honestly.
- **`OPERATIONS_MANUAL.md`** / **`.pdf`** — a 10-page walkthrough (steps A–K) against a single worked example. Contains no passwords, API keys, credentials or secrets; verified by the scan in §12.
- **`ELITE_MODE_FINAL_REPORT.md`** — this document.

Every non-trivial change also carries an in-file comment stating what the code did before, why that was wrong, and what would break if someone "simplified" it back. That is deliberate: several defects in this codebase were reintroduced by well-meaning simplifications, and three shipped tests had encoded a defect as an expectation.

---

## 10. Tests

**137 suites / 2610 passing / 21 skipped / 0 failures.** Run clean under `TZ=UTC` and `TZ=Pacific/Kiritimati`.

New this round:

| Suite | Tests | Covers |
|---|---|---|
| `tests/security/hostile-review-round.spec.ts` | 28 | All seven security findings, plus a **codebase-wide guard** that no controller scopes a data read on `isSuperAdmin` |
| `tests/security/empty-organization-honesty.spec.ts` | 14 | Checklist reachability, the five reassurance sites, `zeroTone` gating, `isError` threading, and a repo-wide scan that no component ORs its error into a "no data" branch |
| `tests/unit/onboarding/empty-state-copy.spec.ts` | 23 | Every subject × presence; no reassurance on an empty org, no "add your first vehicle" to someone who has 400, and `unknown` falling back to the established wording |
| `tests/security/workshop-costing-reachable.spec.ts` | 8 | The parts/labour chain end to end; UI gates matching server permission and status rules; the inventory client staying read-only |
| `tests/security/esg-export-scope.spec.ts` (rewritten) | +3 | The composite score's three branches |
| `tests/security/honest-metrics.spec.ts` (extended) | +3 | The headline fleet-health score, behaviourally |

**Verification method.** Every fix was proven by **re-injecting the original defect and confirming the new test fails.** Demonstrated in-session for the fleet-health score (`Received: 0`) and for the fuel `driver_id` strip.

**A note on assertion style.** Three previously-shipped tests in this codebase had encoded a defect as an expectation, and two more broke on refactors that were strictly better because they matched source text. New tests assert **answers, not arithmetic** wherever a behavioural test is possible; where a structural assertion is genuinely the right tool (a call site is wired, a permission matches), comments are stripped before matching — every fix here quotes the code it replaced, so a naive substring search finds the old copy in the explanation of its own removal.

---

## 11. Remaining Issues — documented, not hidden

These are real gaps. None was stubbed, faked, or half-built.

**Whole personas without a UI**
1. **Compliance Officer has no product.** `frontend/modules/compliance/` contains only `.gitkeep` files while six `/api/compliance/*` routes run live. `nav.config.ts:449` already lists `/compliance` as a backend module with no page. The only surrogates are a licence-expiry column in `DriversTable` and compliance-tagged cards in the Command Centre.
2. **Inventory, procurement and vendors** — 22 live routes, empty frontend scaffolds. This round added the narrow read-only slice the workshop path needs and nothing more; a stock-receipt, adjustment, movement-history and reorder UI is a feature.

**Last-mile gaps not closed here**
3. **No self-service signup.** `app/auth/` has no register page and `app/api/auth/` no register route, though `shared/config/constants.ts` still declares `/api/auth/register`.
4. **Email invitations dead-end.** The admin UI, the invite endpoint, `useAcceptInvite`, and the accept/decline routes all exist — but no email is ever sent (no import of `email.service.ts` anywhere in the organizations module) and no page redeems the token. `ORGANIZATION_ROUTES.invite(token)` names a route that does not exist. **Mitigated**: the dialog defaults to "Add directly", which works and shows a copyable temporary password.
5. **No vehicle bulk import.** `POST /api/vehicles/import` exists and nothing calls it; export works. A customer with 200 vehicles must type each one.
6. **GL reconciliation can never be reconciled.** `POST /api/finance/gl/submissions` exists; the client implements only the GET, so every account renders "Not submitted" forever. `POST /api/finance/allocations` and `.../reverse` likewise have no UI.
7. **No depreciation.** `/api/finance/depreciation/{profiles,post}` have no UI and no client method, so cost-per-km never includes depreciation.
8. **Executive dashboard cannot be steered or exported.** `ExecutiveDashboard.tsx:29` destructures `[filter]` with no setter and no filter UI; permanently locked to `last30Days`. No export or print control.
9. **No document storage anywhere** — no module, no route. Blocks driver licence/medical evidence and compliance evidence.

**Dead code (verified, deliberately not deleted)**
10. `frontend/modules/reports/pages/AnalyticsOverview.tsx` and `ReportPreview.tsx` are barrel-only: no route imports them. `getPerformanceMetrics` has **zero callers anywhere**. Deleting working, complete code is destructive and routing it is a product decision; its metrics were made honest so that if it is ever routed it does not lie. Recommend an explicit keep-or-delete decision.
11. `app/(protected)/observability/operational/page.tsx` — route exists, nothing links to it.
12. Five unused layout components in `frontend/shared/layouts/`.
13. **~90 orphaned API routes** (dispatch, bookings, scheduling, SLA, rules, anomalies, webhooks, OAuth clients, admin jobs, geofences, digital twin, legacy `/api/reports/*`). Each is authenticated and permission-gated, so this is surface area rather than exposure — but it is surface area to maintain and to threat-model.

**Known architectural decision, unchanged**
14. **The WebSocket layer is unconsumed on both ends** — `initialize()` is never called, the client is imported by nothing, there is no `/api/socket` route, and 29 emit sites are no-ops. This was **deliberately not wired**: it is a hosting decision on a serverless target, not a code change. `warnRealtimeDisabledOnce()` now makes the silence audible once per process instead of never.

**Pre-existing lint baseline**
15. `npm run lint` reports **23 errors and 1 warning**, all pre-existing, all in files outside this change set (`app/api/{cron,observability,organizations,version,workflows}/…`, `lib/{authOptions,import-export,sso-provider.factory}.ts`) — mostly `no-explicit-any` and unused imports. **Zero lint findings in any file created or rewritten in this round.**

---

## 12. Manual Steps Required Before Deploy

These are not optional. Two of them will stop the application from starting, by design.

1. **Set `REFRESH_TOKEN_SECRET`.** The app now refuses to start without it. Generate with `openssl rand -base64 32`. It must be **different** from `NEXTAUTH_SECRET` — a shared key means a leaked access secret also mints refresh tokens. Already added to `docker-compose.yml` and `.github/workflows/ci.yml`; add the corresponding CI secret and any deployment-platform variable.

2. **Verify `NEXTAUTH_SECRET` is a real secret.** Startup now rejects unset, published-placeholder, and under-24-character values. **If your deployment was relying on the old fallback, every existing session and token is already compromised** — rotate the secret and treat prior tokens as untrusted.

3. **Re-save every scheduled report definition once.** Schedules created before this round carry no `orgUnitIds` on their job payload and now **fail closed**, producing an empty report rather than an organization-wide one. Opening and saving each definition re-freezes the creator's scope. This is a deliberate trade: a surprising empty report is recoverable; an org-wide export emailed to a branch manager's recipient list is not.

4. **Run `npm run db:indexes`.** The attention-dispatch idempotency guarantee depends on the partial unique index `uniq_attention_dispatch_tenant_idempotency`; without it only the application-level pre-read protects against duplicate work orders, and a genuine race can slip through.

5. **Decide on `AnalyticsOverview` / `ReportPreview`** (§11.10) — route them or delete them.

6. **Optional:** `npm run finance:backfill-ledger` (dry-run by default; `--confirm` to apply) backfills allocation postings for records that predate the posting handler. It refuses ambiguous plates and audits to `tbltenant_repair_audit`.

---

## 13. Production Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deploy without `REFRESH_TOKEN_SECRET` | **High** if the checklist is skipped | App fails to start | Deliberate and loud: the error names the variable and the command to generate it. Failing to start beats serving with a forgeable key. |
| Prior tokens signed with the published fallback remain valid at any site that relied on it | Medium | Full cross-tenant compromise | §12.2 — rotate and treat prior tokens as untrusted. |
| Scheduled reports silently produce empty output until re-saved | **Certain** for existing schedules | Confusing but safe | §12.3. Chosen over preserving the leak. |
| Work-order scope tightening surfaces as "records disappeared" | Medium | Support load | Users were seeing rows they were never entitled to. Behaviour now matches every other module; worth a release note. |
| `orgUnitId` update gate rejects a previously-accepted request | Low | A previously-working call now 403s | It was a write escalation. Org-wide roles are unaffected. |
| Empty-state copy assumes vehicles are the anchor of setup | Low | A pre-telematics customer sees "add a vehicle" | `unknown` falls back to established-fleet wording, so the failure mode is silence, not a wrong instruction. |
| Parts dialog reads up to 200 parts for the picker | Low | Slow for a very large catalogue | Cached 5 minutes, fetched only when the dialog opens. A server-side typeahead is the fix if a catalogue outgrows it. |
| 37 chart components edited by a scripted transform | Low | Layout regression | `tsc` clean, full suite green, production build green, and a repo-wide conformance test asserts the resulting shape. The two `if`-form variants were re-wrapped in their original card chrome. |
| ~90 orphaned API routes | Low | Maintenance and threat-model surface | All authenticated and permission-gated. Recommend an explicit keep/remove pass. |
| Real-time layer remains unconsumed | Known | No live updates | Deliberate (§11.14); now logs once rather than silently no-op'ing. |

---

## 14. Final Product Assessment

**What this platform now does well.** Multi-tenancy and org-unit isolation are enforced consistently and, more importantly, are enforced by *shared* primitives — `buildFilter`, `canAccessRecord`, `resolveCreationOrgUnitId`, the write-scope resolvers — rather than by rules restated per module. That matters because every scope defect found in this round was a call site that had *not* used the shared primitive; the primitives themselves were correct and fail closed in all three states. Financial correctness is protected by an append-only ledger with deterministic idempotency keys and partial unique indexes, and the posting rules now live in one builder shared by the handler and the backfill so they cannot drift. The Command Centre is a genuinely strong operations surface: ranked by severity and cost at stake, with both actions wired end to end. Test coverage is substantial and, more valuably, *adversarial* — several suites were written by re-injecting the defect they guard.

**What it does not yet do.** It cannot onboard a customer without an administrator creating their account by hand. It has no product at all for a compliance officer. Its workshop can now cost a job but cannot manage the stock that job draws on. Its finance module can report but cannot post or reconcile. These are not defects — they are unbuilt features with their backends already in place, which is a good position to be in but not the same as being finished.

**On the quality bar.** The single most important thing this round changed is not any one fix; it is that **the product no longer asserts things it does not know.** A score computed over nothing is `null`. A request that failed says so instead of reporting zero. An empty subsystem is not described as healthy. An export refuses to invent the two-thirds of a composite it could not measure, and says which parts it excluded. That property is worth more to a customer than any feature, because every number the platform shows is now either a measurement or an explicit admission that there isn't one — and a fleet manager who can trust the zeroes can trust the rest.

**Production readiness.** With the six manual steps in §12 completed, this is deployable. The security posture is materially stronger than at the start of this round: one critical authentication bypass and three cross-boundary data leaks are closed, each with a regression test, and the class of defect behind three of them now has a codebase-wide guard. The remaining gaps in §11 are visible, scoped and honest — which is the condition under which a team can plan, rather than discover.

---

*Verification: `npx tsc --noEmit` clean · `npm run test:security` 1602 · `test:unit` 2583 · `test:e2e` 14 · `test:performance` 13 · `test:integration` 21 skipped (require a live database) · full suite 2610 passing under two timezones · `next build` 229/229 static pages, 102 kB shared JS.*
