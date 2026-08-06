// modules/analytics/services/analytics-scope.service.ts
//
// Single source of truth for turning an AnalyticsScope into a MongoDB
// match-stage fragment. Every module's analytics repository (Fuel today;
// Expenses/Trips/Maintenance next) calls this from its own
// `buildBaseMatch()` helper instead of hand-rolling scope logic, so
// "Vehicle Analytics" behaves identically everywhere: same field name
// per scope type, same normalization (upper-casing plates), same
// no-op-when-fleet behaviour.
//
// This is deliberately decoupled from TenantScopeService
// (modules/tenancy/services/tenant-scope.service.ts): tenant/org-unit
// scoping controls WHO may see WHICH records (authorization), while
// AnalyticsScope controls WHAT SLICE of those records a given
// dashboard/query aggregates over (a view concern). The two compose:
// buildBaseMatch() applies tenant isolation first, then this.

import { AnalyticsScope, isFleetScope } from '@/shared/types/analytics-scope.types';

export class AnalyticsScopeService {
  /**
   * Narrows `match` per `scope`. Returns `match` unchanged for a fleet
   * scope (or when `scope` is omitted) -- this is what guarantees every
   * existing fleet-wide chart is byte-for-byte unaffected by this
   * refactor.
   */
  applyScope(match: Record<string, unknown>, scope?: AnalyticsScope): Record<string, unknown> {
    if (isFleetScope(scope)) return match;

    const value = scope!.value as string;

    switch (scope!.type) {
      case 'vehicle':
        return { ...match, license_plate: value.toUpperCase() };
      case 'driver':
        return { ...match, driver_id: value };
      case 'department':
      case 'branch':
      case 'workshop':
        return { ...match, orgUnitId: value };
      default:
        return match;
    }
  }
}

export const analyticsScopeService = new AnalyticsScopeService();