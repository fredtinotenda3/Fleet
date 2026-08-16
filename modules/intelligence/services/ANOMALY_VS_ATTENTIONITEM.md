# Anomaly vs AttentionItem (Phase 0, item 7)

**Decision: KEEP BOTH, as two genuinely distinct models. No third
intelligence model was created.**

## What each one actually is

|  | `Anomaly` (`tblanomalies`) | `AttentionItem` (`tblattentionitems`) |
|---|---|---|
| Nature | An **incident log entry** -- something that happened and was flagged, with its own audit trail | A **live snapshot** of "what currently needs attention", recomputed on every dashboard load |
| Write pattern | Append: one new row per (category, vehicle, day) that the condition holds, deduplicated by `fingerprint` so a burst of the same-day events doesn't spam duplicates | Upsert-in-place: one row per `(tenantId, itemKey)`, overwritten every refresh (`AttentionItemRepository.upsertFeedItems`) -- there is exactly one current row per item, never a history of past states |
| Lifecycle | `open -> acknowledged \| resolved \| dismissed`, each transition timestamped and attributed (`acknowledgedAt/By`, `resolvedAt/By`) -- an ops triage workflow | `open -> resolved`, where "resolved" specifically means a `ValueLedgerEntry` was written recording a realized cost avoidance (see `attention-resolution.service.ts`) -- a financial-value-capture workflow, not a triage workflow |
| Trigger | Event-driven: `IntelligenceHandler` runs detection on `FuelLogged`/`ExpenseCreated` domain events, as things happen | Pull-driven: `needsAttentionService.getFeed()` recomputes the whole feed on demand (dashboard load), from the CURRENT state of seven different sources |
| Sources | Two: its own fuel-efficiency and expense-spike heuristics (`AnomalyDetectionService`) | Seven: predictive-maintenance, fleet-health, driver-risk, fuel-fraud, expense-anomaly, compliance, maintenance -- `Anomaly`'s two detectors are not among them |
| Retained history | Yes -- an anomaly from three weeks ago that was later resolved is still a queryable row, useful for "how often does this vehicle throw fuel anomalies" | No -- once a condition stops being true, the corresponding `AttentionItem` row is simply not upserted again on the next refresh (there is no history of what needed attention last month) |

## Why not merge them

Folding `Anomaly` into `AttentionItem` would require picking ONE of two
incompatible write/lifecycle models, losing real, currently-used
functionality either way:

- Give `AttentionItem` `Anomaly`'s append+dedup-by-day semantics, and every
  other source (predictive-maintenance, fleet-health, ...) that currently
  relies on upsert-in-place "always reflects current truth" would start
  accumulating stale historical rows every refresh, breaking the dashboard
  feed's core property.
- Give `Anomaly` `AttentionItem`'s upsert-in-place semantics, and the
  incident audit trail disappears -- there would be no way to answer "how
  many fuel anomalies did this vehicle have last month", which is exactly
  the kind of record an incident log exists to keep.
- Collapsing the two resolution workflows (`acknowledge/resolve/dismiss`
  vs "resolve into a Value Ledger entry") into one would either bolt a
  financial-ledger side effect onto a routine ops-triage dismissal, or
  strip the ledger-backed resolution flow of its audit distinctness.

This is a genuine domain difference (incident log vs live snapshot), not
incidental implementation drift, so `Anomaly` remains separate per the
audit's own instruction ("If it must remain separate, document the exact
architectural reason").

## What WAS fixed in this pass

Auditing `Anomaly` for this decision surfaced a real, separate bug of the
*same class* as Phase 0 item 1 (AttentionItem ownership): `Anomaly.orgUnitId`
was declared on the type and already used to scope reads
(`AnomalyRepository.getFiltered`), but nothing ever resolved and set it at
write time. `AnomalyDetectionService.persistBatch()` now resolves each
anomaly's `licensePlate` to its vehicle's own `orgUnitId` via
`VehicleIdentityResolver` (Phase 0 item 3) before persisting -- reusing
existing Phase 0 infrastructure rather than writing a second plate
resolver. See the updated `intelligence` entry in
`server/tenancy/module-scope.registry.ts` (now `confirmed: true`) for the
full evidence trail.

## What was explicitly NOT done (out of scope for Phase 0)

`AnomalyDetectionService`'s own fuel-efficiency and expense-spike detection
math is a third, independent implementation of "is this fuel/expense
pattern unusual", alongside `modules/ai/services/fuel-fraud-detection.service.ts`
and `modules/ai/services/expense-anomaly-detection.service.ts` (which feed
`AttentionItem`'s `fuel_fraud`/`expense_anomaly` sources). Unlike the
predictive-maintenance duplication (Phase 0 item 5), this is NOT a dead
code path -- `Anomaly`'s detectors are the sole implementation behind the
`/api/anomalies` surface and its own event-triggered persistence, actively
used and covered by their own tests. Consolidating detection ALGORITHMS
(as opposed to the ownership-resolution bug fixed above) is a larger,
product-facing decision -- which heuristic is authoritative, whether the
two surfaces (`/api/anomalies` incident log vs the dashboard "needs
attention" feed) should show the same underlying detections at all -- and
is out of scope for a foundation-integrity pass. Flagged here for Phase 1
scoping, not silently left unmentioned.
