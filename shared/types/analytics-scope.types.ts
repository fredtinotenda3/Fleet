// shared/types/analytics-scope.types.ts
//
// Conceptual scope model for the Analytics Engine (Vehicle-Level Analytics
// initiative). A scope narrows any existing fleet-wide analytics query to
// a single entity, without changing the calculation itself:
//
//   Fleet Analytics   -> SUM(all vehicles)
//   Vehicle Analytics -> SUM(where license_plate == scope.value)
//
// This is intentionally a tiny, generic contract so every module's
// repository can apply it identically (see AnalyticsScopeService below).
// Omitting `scope` (or passing `{ type: 'fleet' }`) reproduces today's
// fleet-wide behaviour exactly -- existing callers are unaffected.

export type AnalyticsScopeType = 'fleet' | 'vehicle' | 'driver' | 'department' | 'branch';

export interface AnalyticsScope {
  type: AnalyticsScopeType;
  /**
   * The scoping key's value, interpreted per `type`:
   *  - vehicle:    license_plate (upper-cased before matching)
   *  - driver:     driver_id
   *  - department/branch: orgUnitId
   *  - fleet:      unused (no narrowing)
   */
  value?: string;
}

export function isFleetScope(scope?: AnalyticsScope): boolean {
  return !scope || scope.type === 'fleet' || !scope.value;
}

export function vehicleScope(licensePlate: string): AnalyticsScope {
  return { type: 'vehicle', value: licensePlate.toUpperCase() };
}

export function driverScope(driverId: string): AnalyticsScope {
  return { type: 'driver', value: driverId };
}

export function orgUnitScope(type: 'department' | 'branch', orgUnitId: string): AnalyticsScope {
  return { type, value: orgUnitId };
}

/** Human-readable label for dashboard headers ("Vehicle ACT0167" vs "Fleet"). */
export function describeScope(scope?: AnalyticsScope): string {
  if (isFleetScope(scope)) return 'Fleet';
  switch (scope!.type) {
    case 'vehicle':
      return `Vehicle ${scope!.value}`;
    case 'driver':
      return 'Driver';
    case 'department':
      return 'Department';
    case 'branch':
      return 'Branch';
    default:
      return 'Fleet';
  }
}