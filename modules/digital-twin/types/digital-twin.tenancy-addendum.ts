// modules/digital-twin/types/digital-twin.tenancy-addendum.ts
//
// Adds the org-unit dimension to the digital-twin read model.
//
// A twin is a projection of exactly one vehicle, and it is a WIDER
// disclosure than the vehicle row it projects: one document carries the
// live location, sensor snapshot, current driver assignment, fuel/trip
// year-to-date totals and every open alert. If the vehicle is scoped to
// a branch but its twin is not, the twin becomes a complete bypass of
// the vehicle scoping -- a branch manager could read another branch's
// vehicle positions and driver assignments through /api/digital-twin
// while /api/vehicles correctly hid them.
//
// Same additive module-augmentation pattern as
// shared/types/driver.tenancy-addendum.ts: declare-module rather than
// editing digital-twin.types.ts, so nothing currently importing
// VehicleDigitalTwin can regress.
//
// BACKFILL: orgUnitId is inherited from the projected vehicle. Existing
// twins written before this field are invisible to scope-narrowed users
// until `npm run tenancy:backfill -- --confirm` runs, exactly the same
// backward-compat trade-off already accepted for Vehicle/FuelLog/
// Expense/Trip. Org-wide roles are unaffected (accessibleOrgUnitIds is
// null for them).

import '../types/digital-twin.types';

declare module '../types/digital-twin.types' {
  interface VehicleDigitalTwin {
    /** Inherited from the projected vehicle. Set by the projection handler on every write. */
    orgUnitId?: string;
  }
}
