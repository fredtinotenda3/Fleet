// infrastructure/database/indexes.fuel-analytics-addendum.ts
//
// Supports the enterprise Fuel Analytics aggregations without loading
// unnecessary records into memory. Merge into infrastructure/database/
// indexes.ts's INDEXES map the same way indexes.fuel-driver-addendum.ts
// is merged, then run `npm run db:indexes`.
//
//   import { FUEL_ANALYTICS_INDEXES } from './indexes.fuel-analytics-addendum';
//   export const INDEXES = {
//     ...
//     tblfuellogs: [
//       ...BASE_INDEXES.tblfuellogs,
//       ...FUEL_DRIVER_INDEXES.tblfuellogs,
//       ...FUEL_ANALYTICS_INDEXES.tblfuellogs,
//     ],
//   };

export const FUEL_ANALYTICS_INDEXES = {
  tblfuellogs: [
    // Fuel Spend/Top Stations (#4, #8)
    { key: { tenantId: 1, fuel_station_id: 1, date: -1 }, name: 'idx_fuel_tenant_station_date' },
    // Fuel Type Distribution (#6)
    { key: { tenantId: 1, fuel_type: 1 }, name: 'idx_fuel_tenant_type' },
    // Vehicle Fuel Activity Timeline / Fueling Frequency (#1, #7)
    { key: { tenantId: 1, license_plate: 1, date: -1 }, name: 'idx_fuel_tenant_plate_date' },
  ],
} as const;