// infrastructure/database/indexes.trip-analytics-addendum.ts
//
// Supports the Phase 1 Trip KPI and exception-analytics aggregations
// (TripRepository.getTripKpis / getTripExceptions) without full
// collection scans. Merge into infrastructure/database/indexes.ts's
// INDEXES map the same way indexes.fuel-analytics-addendum.ts is
// merged, then run `npm run db:indexes`.
//
//   import { TRIP_ANALYTICS_INDEXES } from './indexes.trip-analytics-addendum';
//   export const INDEXES = {
//     ...
//     tbltrips: [
//       ...BASE_INDEXES.tbltrips,
//       ...TRIP_ANALYTICS_INDEXES.tbltrips,
//     ],
//   };

export const TRIP_ANALYTICS_INDEXES = {
  tbltrips: [
    // KPI facet + status breakdown (getTripKpis)
    { key: { tenantId: 1, status: 1, date: -1 }, name: 'idx_trip_tenant_status_date' },
    // Most-utilized vehicle / vehicle trend / duplicate detection
    { key: { tenantId: 1, license_plate: 1, date: -1 }, name: 'idx_trip_tenant_plate_date' },
    // Most-utilized driver / driver trend
    { key: { tenantId: 1, driver_id: 1, date: -1 }, name: 'idx_trip_tenant_driver_date' },
    // Duration-outlier aggregation (getTripExceptions)
    { key: { tenantId: 1, license_plate: 1, duration_minutes: 1 }, name: 'idx_trip_tenant_plate_duration' },
    // Trip type distribution / future route analytics
    { key: { tenantId: 1, trip_type: 1 }, name: 'idx_trip_tenant_type' },
    { key: { tenantId: 1, routeId: 1, date: -1 }, name: 'idx_trip_tenant_route_date' },
  ],
} as const;
