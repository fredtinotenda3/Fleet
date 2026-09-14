# Wave 1, Part 2 — Checkpoint & Handoff

**Scope of this checkpoint (as accepted):** vehicle trip-history deep link (item 3), fuel/trip reconciliation (item 4), date-range propagation audit and fix (item 5), vehicle-scoped Attention integration (item 7).

**Verified:** `tsc --noEmit` clean · full suite **150/151 test suites, 2802/2823 tests passing, 21 skipped (pre-existing live-MongoDB dependency), 0 failing** · the 7 test files belonging to this checkpoint re-run in isolation: **76/76 passing** · security/tenant isolation verified for both new vehicle-scoping surfaces · data-truth requirements verified for fuel reconciliation · build **not verified** (sandbox `fonts.googleapis.com` egress restriction — documented, not worked around).

This repository has no `.git` (`git status` returns "not a git repository"), so "committed state" below means the working tree at `/home/claude/work/Fleet-main`, and the package is a file-copy snapshot of exactly the files this checkpoint touches, verified against that tree line by line (see Part 3).

---

## Part 1 — What shipped, per item

### Item 3 — Vehicle trip-history deep link

A dedicated `/trips/vehicles/[plate]` page (mirroring the existing fuel/expense/maintenance vehicle-history pages), backed by a new `TripFilters.exactLicensePlate` opt-in that forces an exact, case-folded plate match instead of the list page's case-insensitive **substring** match. Without it, plate `"HRE123"` would also match `"HRE1234"` — a real vehicle-identity leak within the caller's own tenant/org-unit scope. The general `/trips?license_plate=` search box is deliberately left on substring matching; its contract is "search," not "only this vehicle."

Files: `trip.repository.ts`, `trip.controller.ts`, `trips.api.ts`, `VehicleTripHistoryPage.tsx`, `trips/pages/index.ts`, `trips/routes/index.ts`, the new `app/(protected)/trips/vehicles/[plate]/page.tsx` route, `trip.types.ts`, `VehicleActivityTimeline.tsx`'s new deep link, `VehicleDetailPage.tsx`.

Tests: `tests/security/trip-history-vehicle-scope.spec.ts` — 9 tests, both the repository query-shape and the frontend wiring.

### Item 4 — Fuel/trip reconciliation

Treated as a financial data-truth feature, not a UI comparison. A new `FuelValue<T>` discriminated union carries the full six-state vocabulary the spec required — **actual / calculated / derived / estimated / unavailable / not-applicable** — deliberately separate from the existing 5-state `Signal<T>` gauge type (whose `'calculated'` already renders as the label "DERIVED," which would collide with this feature's own distinct `derived` state).

The "expected fuel" figure comes from a **non-overlapping baseline window** (`baselineWindowFor`, ending immediately before the reconciled period, 90 days, minimum 3 logs) — never the period's own efficiency, which would make the variance trivially zero by construction. Every place the calculation could be tempted to guess is refused explicitly: no defensible baseline → everything UNAVAILABLE; zero fuel logs → a real ACTUAL zero (unambiguous); no fuel purchased in the period → cost UNAVAILABLE but distance-only variance can still compute; electric vehicles → NOT-APPLICABLE via the existing `vehicleProfileFor(...).isElectric` resolver, never a zeroed-out panel.

One limitation is surfaced rather than hidden: `getFuelKpis`'s aggregation cannot currently distinguish "vehicle sat still" from "no distance signal at all" — both collapse to `0` — so a zero-distance period renders UNAVAILABLE, not a confirmed zero. Flagged in the module's own header comment as a deferred upstream enhancement (see Part 2).

Files: `fuel-reconciliation.ts` (new calculation module), `VehicleFuelReconciliationPanel.tsx` (new), `VehicleFuelAnalyticsPanel.tsx`, `VehicleAnalyticsPanel.tsx`, `VehicleDetailPage.tsx` (threads `isElectric`), `date.utils.ts` (additive `'7d'`/`'30d'` presets).

Tests: `fuel-reconciliation.spec.ts` (16, pure calculation) + `fuel-reconciliation-panel-wiring.spec.ts` (9, source-conformance) = 25.

### Item 5 — Date-range propagation

Traced the selected range through every Vehicle Hub metric that claims to be range-sensitive: selector → hook → API → aggregation → chart, for roughly 20 components. **One real defect found:** `FuelKpiCards` ignored the selected range entirely (`useFuelKpis(undefined, licensePlate)`), so a user could change Today/7d/30d/Custom and watch the fuel KPI cards not move. Fixed by threading `dateRange` through.

Every other candidate was checked against its fleet-wide equivalent page and either confirmed range-sensitive already, or found to be a **deliberate, documented exception** — turned into an executable regression assertion, not just a comment, so a future refactor that silently changes one of these can't slip through unnoticed: `AbnormalConsumptionWidget`, `TripMonthlyTrendChart`, `ExpenseStatsCards`, `ExpenseCategoryChart`, the whole Maintenance panel, and `VehicleOperationalHeader`'s intentional "today" fixation.

Files: `FuelKpiCards.tsx` (the fix), `VehicleFuelAnalyticsPanel.tsx` (wiring), `date.utils.ts` (shared with item 4).

Tests: `tests/regression/vehicle-hub-date-range-propagation.spec.ts` — 14 tests, a new `tests/regression/` category.

### Item 7 — Vehicle-scoped Attention integration

The security-critical item. `needsAttentionService.getFeedForVehicle(tenantId, vehicleId, context?, limit?)` authorizes **once**, before any source is read — loads the vehicle within `tenantId`, checks `tenantScopeService.canAccessRecord`, and fails closed with an indistinguishable `NotFoundError('Vehicle not found')` for both "doesn't exist" and "exists but out of scope." Only then does it read four vehicle-identifiable sources (predictive maintenance, fuel fraud, compliance, maintenance/work-orders) via existing, already-bounded single-entity service methods and queries — never a fetch-then-filter over the fleet-wide, truncated feed. `driver_risk`/`expense_anomaly`/`fleet_health` are excluded on purpose: their `entityId` cannot identify a vehicle, and guessing would risk misattribution.

**Self-caught fix during development** (not flagged by review — found before any callers existed): the first draft took `licensePlate` as an independent parameter, which would have let a request pair an authorized `vehicleId` with an unrelated plate to fish for that plate's maintenance/work-order items. Fixed by deriving the plate only from the authorized vehicle record; the method has no such parameter today.

**Byproduct defect found and fixed:** the exact same plate-substring leak from item 3 also existed in `WorkOrderFilters`/`WorkOrderRepository`. Same `exactLicensePlate` opt-in fix; the `/workorders?license_plate=` list page's search box is unchanged.

Controller: `GET /api/ai/needs-attention?vehicleId=...` branches to the new method (mirrors the existing `?vehicleId=` precedent already used by `getPredictiveMaintenance`); `NotFoundError` maps to a real 404. Frontend: `useVehicleNeedsAttention` + `dashboardApi.getNeedsAttentionForVehicle` (a dedicated endpoint call, not a client-side filter) and a new `VehicleAttentionPanel` on the Vehicle Detail Overview tab, reusing the Command Centre's existing `AttentionItemCard` / `ResolveAttentionDialog` / `useAttentionActions` rather than a parallel implementation.

Files: `needs-attention.service.ts`, `ai.controller.ts`, `compliance.service.ts` (new thin `listOpenForEntityInScope` wrapper over a previously-unused, already-correct repository method), `workorder.repository.ts`, `workorder.types.ts`, `dashboard.api.ts`, `useVehicleAttention.ts` (new), `VehicleAttentionPanel.tsx` (new), `hooks/index.ts`, `VehicleDetailPage.tsx`.

Tests: `needs-attention-vehicle-scope.spec.ts` (15 — including the core requirement: identical `NotFoundError` for a nonexistent vehicle and an out-of-scope one) + `workorder-vehicle-plate-substring-leak.spec.ts` (4, regression) + `vehicle-attention-wiring.spec.ts` (9, frontend conformance) = 28.

---

## Part 2 — Remaining known gaps (not fixed in this checkpoint, by design)

1. **`getFuelKpis` zero-distance ambiguity.** The aggregation cannot currently tell "vehicle didn't move" from "no distance signal was ever recorded." Fuel reconciliation takes the conservative path (renders UNAVAILABLE) rather than guessing, but the honest fix is upstream: add a `hasDistanceSignal` field to `FuelKpis`. Scoped out of this checkpoint to avoid widening a single-vehicle UI feature into a change to shared fuel-repository aggregation code.
2. **`Trip.estimated_cost` / `Trip.fuel_used`** remain unpopulated stubs (pre-existing, predates this checkpoint).
3. **`/workorders?license_plate=` and `/trips?license_plate=` and their fuel/expense/maintenance siblings** keep substring matching by design — that is the correct contract for a free-text search box, including the "view this vehicle's records" links that pre-fill it. Only the *dedicated, single-vehicle* views (trip history page, `getFeedForVehicle`) were given the exact-match path. If a future page adds a similar "this vehicle only" contract, it needs the same `exactLicensePlate` treatment — the pattern is now established in three places (trips, work orders, and the reconciliation panel's own hooks) and should be reached for by default rather than re-discovered.
4. **Lint debt — precisely characterized, none of it newly introduced by this checkpoint's logic:**
   - `ai.controller.ts` (5), `needs-attention.service.ts` (1), `compliance.service.ts` (2), `trip.controller.ts` (6), `trip.repository.ts` (11), `workorder.repository.ts` (1) — 26 pre-existing errors (unused imports, scattered `any` casts for Mongo/query-param interop), confirmed by line-location cross-check to sit on code untouched by this checkpoint's actual edits.
   - `tests/security/trip-history-vehicle-scope.spec.ts` (5) — a genuinely different case: this file was *written* for item 3, and knowingly mirrored an already-established test-suite anti-pattern (`any`-casting a private `getCollection` for spying; `require()` for `fs`/`path`) rather than inventing a new one. The identical pattern was cleaned up in this checkpoint's two newer test files (`vehicle-hub-date-range-propagation.spec.ts`, `workorder-vehicle-plate-substring-leak.spec.ts` — both 0 lint errors), but this original file was left as-is. Self-identified, not hidden, and would be a safe one-file, zero-behavior-change cleanup if wanted — deliberately not done here per this checkpoint's "no changes" instruction.
5. **Items 1, 2 and 6** (vehicle-scoped live map frontend mount, the 13-field operational header, trip-level cost on the trip list/detail) also have working-tree changes present, all covered by the same green 2802-test full-suite run, but they are **outside this checkpoint's declared four-item scope** and were not independently re-verified or packaged here. Recommend confirming whether they were already checkpointed separately, or should be folded into a follow-up package before Wave 2 begins — they are not represented in `fleet-wave1-part2.zip`.

## Part 3 — Package verification

`fleet-wave1-part2.zip` contains exactly the 32 files this checkpoint's four items touch (paths preserved), plus this report. Verified: every file in the manifest exists in the working tree; the zip's file list was diffed against the manifest (32 in, 32 out, no extras, no omissions); each entry's contents were confirmed to match the working-tree file at write time (built directly from the tree, not from a cache or an earlier draft).

## Part 4 — Recommended starting point for Wave 2

**Not R.2/R.4 alert-type configuration.** Per the Wave 1 gap assessment (`WAVE_1_GAP_ASSESSMENT_AND_REPORT.md`, section A.1), the rule engine (`modules/rules/`) has no caller anywhere in the codebase — `ruleTriggerService.fireEvent` is never invoked by any domain module. Everything that alerts today runs through five independent hardcoded paths instead, the largest being `reading-alerts.ts`'s compile-time thresholds (`SPEEDING_THRESHOLD_KMH = 120`, etc.) evaluated on every ingested reading.

Building out R.4–R.15's alert-type configuration against an engine nothing calls would add a **seventh** hardcoded path, not consolidate the existing six. The correct Wave 2 entry point is therefore:

1. Wire `ruleTriggerService.fireEvent` into the live ingest path (the same point `reading-alerts.ts`'s `deriveReadingAlerts` currently runs).
2. Migrate `reading-alerts.ts`'s compile-time thresholds into tenant-configurable rules on the engine — this one migration is what makes "one alert engine" true for the first time, and is the highest-leverage single change before any new alert type is added.
3. Resolve the two false affordances found alongside this: the `set_variable` rule action's `execute()` is empty (a rule using it silently does nothing), and `push` is a selectable notification channel with no implementation anywhere.
4. Only then take up R.4/R.5/R.13 (fuel, driving behaviour, RPM) — the three Part R domains with real signal in the canonical telemetry model today. R.6/R.7/R.9/R.10/R.12/R.14/R.15 remain **blocked by external dependency** (no canonical signal for cargo temperature, TPMS, trailer, load, e-lock, PTO, or toll) — the safe, non-presumptuous move there is extending the canonical contract with optional signal groups an adapter *can* populate, never fabricating the values themselves.
