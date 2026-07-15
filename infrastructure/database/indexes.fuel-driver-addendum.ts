// infrastructure/database/indexes.fuel-driver-addendum.ts
//
// NEW index supporting the Driver feature on Fuel:
//   - FuelFilters.driver_id (list/filter fuel logs by driver)
//   - FuelRepository.getFuelByDriver's $match+$group pipeline
// Follows the same addendum pattern as indexes.session-addendum.ts /
// indexes.security-addendum.ts -- merge into infrastructure/database/
// indexes.ts's INDEXES map the same way those are merged (see the
// `export const INDEXES = { ...BASE_INDEXES, ...SESSION_INDEXES, ... }`
// block), then run `npm run db:indexes`.
//
// Example merge:
//   import { FUEL_DRIVER_INDEXES } from './indexes.fuel-driver-addendum';
//   export const INDEXES = {
//     ...BASE_INDEXES,
//     ...SESSION_INDEXES,
//     ...SECURITY_INDEXES,
//     tblfuellogs: [...BASE_INDEXES.tblfuellogs, ...FUEL_DRIVER_INDEXES.tblfuellogs],
//     ...
//   };

export const FUEL_DRIVER_INDEXES = {
  tblfuellogs: [
    {
      key: { tenantId: 1, driver_id: 1, date: -1 },
      name: 'idx_fuel_tenant_driver_date',
    },
  ],
} as const;