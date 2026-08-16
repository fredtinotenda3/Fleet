# modules/intelligence/services -- architectural decisions

## Predictive maintenance: consolidated into `modules/ai/services` (Phase 0)

**Removed:** `modules/intelligence/services/predictive-maintenance.service.ts`
(`PredictiveMaintenanceService.predictMaintenanceNeeds(tenantId)`).

**Kept, authoritative:** `modules/ai/services/predictive-maintenance.service.ts`
(`predictiveMaintenanceService.predictAll()` / `.predictVehicle()`).

### Evidence, not assumption

Before removing anything, both implementations, every caller, and every
test were read directly:

| | `modules/intelligence` (removed) | `modules/ai` (kept) |
|---|---|---|
| Org-unit scoping | None -- reads the whole tenant's fleet unconditionally | Full `TenantContext`-scoped (`predictAll(context)`), plus per-vehicle `predictVehicle(vehicleId, tenantId)` |
| Tenant resolution | `event.metadata?.tenantId \|\| 'default'` -- `'default'` is now hard-rejected by `resolveTenantScope()` (see `server/tenancy/tenant-scope.ts`) | `resolveEventTenantOrWarn()` (event path) / caller-supplied `TenantContext` (dashboard path) |
| Only caller | `IntelligenceHandler.runPredictiveMaintenance()`, on `TripCreated`/`TripCompleted`/`VehicleUpdated` | `needsAttentionService` (dashboard "needs attention" feed) **and** `AIPredictionTriggerHandler`, on `VehicleUpdated`/`TripCompleted`/`MaintenanceCompleted` -- i.e. the same trigger events |
| What happened to the result | **Discarded.** `IntelligenceHandler` called `predictMaintenanceNeeds()` and never read, stored, or returned the result. | Persisted: feeds `AttentionItem` via `needsAttentionService.persistFeed()` (see Phase 0 item 1, `attention-ownership.resolver.ts`), which is what the product's dashboards actually read. |
| Scope of work per event | Recomputed predictions for **every vehicle in the tenant**, regardless of which vehicle the triggering event was about | `AIPredictionTriggerHandler` calls `predictVehicle(payload.vehicleId, tenantId)` -- exactly the one vehicle the event names |
| Tests | None | Covered indirectly via `tests/security/needs-attention-scope.spec.ts` and the Phase 0 attention-ownership suite |

### Conclusion

The `modules/intelligence` copy was not a genuine second implementation
serving a different layer (the "keep both, document why" branch of the
audit's instruction) -- it was dead weight that ran real work on every
trip-completion event in the platform and threw the result away, while a
second, independent handler (`AIPredictionTriggerHandler`) was already
correctly triggering the real implementation on the same events. Removing
it changes no observable behavior (its output was never consumed by
anything) and removes a source of wasted computation plus a latent crash
(the `'default'` tenant fallback).

### What changed

- Deleted `modules/intelligence/services/predictive-maintenance.service.ts`.
- `IntelligenceHandler` no longer has a `TripCreated`/`TripCompleted`/
  `VehicleUpdated` case (see the comment left in its `handle()` switch for
  the full reasoning, mirrored from this document). Its `FuelLogged` /
  `ExpenseCreated` anomaly-detection handling is untouched.
- `modules/intelligence/services/anomaly-detection.service.ts` is
  untouched -- it is a genuinely distinct, actively-used implementation
  (persists to `tblanomalies`, called from `IntelligenceHandler` for
  fuel/expense anomalies) and was out of scope for this consolidation.
- See `tests/security/predictive-maintenance-consolidation.spec.ts` for
  the regression guard against reintroducing a second implementation.
