// modules/reporting/registry/bootstrap-data-sources.ts
//
// Fix 4 additions on top of Fix 3's pushdown rewrite:
//   1. Registers the new `drivers` and `organizations` (branch/org-unit)
//      data sources.
//   2. Adds `orgUnitId` (raw, filterable) + `orgUnitName` (resolved via
//      $lookup, groupable/displayable) fields to vehicles, expenses,
//      fuel, and trips -- closing missing capability #2, "no
//      organization or branch field on any registered data source."
//      Maintenance/reminders is deliberately left unchanged here: unlike
//      the other four, indexes.ts has no idx_reminder_*_orgunit index,
//      so an orgUnitId field on that collection is unconfirmed.

import { Document } from 'mongodb';
import { dataSourceRegistry } from './DataSourceRegistry';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { driversDataSource } from './data-sources/drivers.data-source';
import { organizationsDataSource } from './data-sources/organizations.data-source';

const LEGACY_FALLBACK_PAGE = { page: 1, limit: 10000 };

function tenantScoped(tenantId: string) {
  return { tenantId, isDeleted: { $ne: true } };
}

/**
 * Resolves `orgUnitId` -> `orgUnitName` via a $lookup into tblorgunits.
 * Uses a pipeline-style $lookup with $toString on both sides of the
 * equality check (rather than a plain localField/foreignField lookup)
 * because whether `orgUnitId` is stored as a string or an ObjectId on
 * each of these four collections isn't confirmed -- this join works
 * correctly either way.
 *
 * NOTE: this stage runs in report-query.engine.ts's pipeline AFTER the
 * initial `$match`, so `orgUnitName` is available for grouping/sorting/
 * column projection but NOT as a `$match` filter field -- filter on the
 * raw `orgUnitId` instead if you need to scope a report to one branch.
 */
function orgUnitLookupStages(): Document[] {
  return [
    {
      $lookup: {
        from: 'tblorgunits',
        let: { ouId: '$orgUnitId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$ouId' }] } } },
          { $project: { name: 1 } },
        ],
        as: '__orgUnit',
      },
    },
    { $unwind: { path: '$__orgUnit', preserveNullAndEmptyArrays: true } },
    { $addFields: { orgUnitName: '$__orgUnit.name' } },
    { $project: { __orgUnit: 0 } },
  ];
}

const ORG_UNIT_FIELDS = [
  { key: 'orgUnitId', label: 'Org Unit ID', type: 'string' as const, aggregatable: false, groupable: true },
  { key: 'orgUnitName', label: 'Branch', type: 'string' as const, aggregatable: false, groupable: true },
];

let bootstrapped = false;

export function bootstrapDataSources(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  dataSourceRegistry.register({
    key: 'vehicles',
    label: 'Vehicles',
    collectionName: 'tblvehicles',
    baseFilter: tenantScoped,
    prePipeline: orgUnitLookupStages,
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'make', label: 'Make', type: 'string', aggregatable: false, groupable: true },
      { key: 'model', label: 'Model', type: 'string', aggregatable: false, groupable: true },
      { key: 'year', label: 'Year', type: 'number', aggregatable: false, groupable: true },
      { key: 'vehicle_type', label: 'Vehicle Type', type: 'string', aggregatable: false, groupable: true },
      { key: 'fuel_type', label: 'Fuel Type', type: 'string', aggregatable: false, groupable: true },
      { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
      { key: 'odometer', label: 'Odometer', type: 'number', aggregatable: true, groupable: false },
      { key: 'purchase_date', label: 'Purchase Date', type: 'date', aggregatable: false, groupable: false },
      ...ORG_UNIT_FIELDS,
    ],
    fetch: async (tenantId) => {
      const result = await vehicleRepository.getFilteredVehicles({}, LEGACY_FALLBACK_PAGE, tenantId);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'expenses',
    label: 'Expenses',
    collectionName: 'tblexpenses',
    baseFilter: tenantScoped,
    prePipeline: orgUnitLookupStages,
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'amount', label: 'Amount', type: 'currency', aggregatable: true, groupable: false },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'description', label: 'Description', type: 'string', aggregatable: false, groupable: false },
      { key: 'expense_type_id', label: 'Expense Type', type: 'string', aggregatable: false, groupable: true },
      ...ORG_UNIT_FIELDS,
    ],
    fetch: async (tenantId) => {
      const result = await expenseRepository.getFilteredExpenses({}, tenantId, LEGACY_FALLBACK_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'fuel',
    label: 'Fuel Logs',
    collectionName: 'tblfuellogs',
    baseFilter: tenantScoped,
    prePipeline: orgUnitLookupStages,
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'fuel_volume', label: 'Fuel Volume', type: 'number', aggregatable: true, groupable: false },
      { key: 'cost', label: 'Cost', type: 'currency', aggregatable: true, groupable: false },
      { key: 'odometer', label: 'Odometer', type: 'number', aggregatable: true, groupable: false },
      { key: 'fuel_type', label: 'Fuel Type', type: 'string', aggregatable: false, groupable: true },
      { key: 'station_name', label: 'Station', type: 'string', aggregatable: false, groupable: true },
      ...ORG_UNIT_FIELDS,
    ],
    fetch: async (tenantId) => {
      const result = await fuelRepository.getFilteredLogs({}, tenantId, LEGACY_FALLBACK_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'maintenance',
    label: 'Maintenance Reminders',
    collectionName: 'tblreminders',
    baseFilter: tenantScoped,
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'title', label: 'Title', type: 'string', aggregatable: false, groupable: false },
      { key: 'due_date', label: 'Due Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
      { key: 'priority', label: 'Priority', type: 'string', aggregatable: false, groupable: true },
      { key: 'category', label: 'Category', type: 'string', aggregatable: false, groupable: true },
      { key: 'estimated_cost', label: 'Estimated Cost', type: 'currency', aggregatable: true, groupable: false },
    ],
    fetch: async (tenantId) => {
      const result = await maintenanceRepository.getFilteredReminders({}, tenantId, LEGACY_FALLBACK_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'trips',
    label: 'Trips',
    collectionName: 'tbltrips',
    baseFilter: tenantScoped,
    prePipeline: orgUnitLookupStages,
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'mode', label: 'Mode', type: 'string', aggregatable: false, groupable: true },
      { key: 'distance_calculated', label: 'Distance', type: 'number', aggregatable: true, groupable: false },
      { key: 'driver_id', label: 'Driver', type: 'string', aggregatable: false, groupable: true },
      ...ORG_UNIT_FIELDS,
    ],
    fetch: async (tenantId) => {
      const result = await tripRepository.getFilteredTrips({}, tenantId, LEGACY_FALLBACK_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register(driversDataSource);
  dataSourceRegistry.register(organizationsDataSource);
}