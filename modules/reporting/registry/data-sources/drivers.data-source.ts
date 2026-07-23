// modules/reporting/registry/data-sources/drivers.data-source.ts
//
// Fixes missing capability #3: driver-level report building previously
// had no dedicated data source -- the only driver-related field
// reportable anywhere was the raw `driver_id` string on the trips
// source. This registers a proper `drivers` data source over
// tbldrivers, giving report authors real driver attributes (status,
// license expiry, driver_code) to filter/group/aggregate by, separate
// from the AI driver-risk-scoring subsystem
// (modules/ai/services/driver-risk.service.ts), which remains its own
// non-composable analysis pipeline -- this does not attempt to merge
// the two.

import { DataSourceDefinition } from '../../types/data-source.types';

function tenantScoped(tenantId: string) {
  return { tenantId, isDeleted: { $ne: true } };
}

export const driversDataSource: DataSourceDefinition = {
  key: 'drivers',
  label: 'Drivers',
  collectionName: 'tbldrivers',
  baseFilter: tenantScoped,
  fields: [
    { key: 'name', label: 'Name', type: 'string', aggregatable: false, groupable: true },
    { key: 'driver_code', label: 'Driver Code', type: 'string', aggregatable: false, groupable: true },
    { key: 'email', label: 'Email', type: 'string', aggregatable: false, groupable: false },
    { key: 'phone', label: 'Phone', type: 'string', aggregatable: false, groupable: false },
    { key: 'license_number', label: 'License Number', type: 'string', aggregatable: false, groupable: false },
    { key: 'license_expiry', label: 'License Expiry', type: 'date', aggregatable: false, groupable: false },
    { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
  ],
  fetch: async (tenantId) => {
    const { driverRepository } = await import('@/modules/drivers/repositories/driver.repository');
    const drivers = await driverRepository.findAll(tenantId);
    return drivers as unknown as Array<Record<string, unknown>>;
  },
};