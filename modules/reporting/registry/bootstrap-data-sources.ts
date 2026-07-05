// modules/reporting/registry/bootstrap-data-sources.ts

import { dataSourceRegistry } from './DataSourceRegistry';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';

const LARGE_PAGE = { page: 1, limit: 10000 };

let bootstrapped = false;

export function bootstrapDataSources(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  dataSourceRegistry.register({
    key: 'vehicles',
    label: 'Vehicles',
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
    ],
    fetch: async (tenantId) => {
      const result = await vehicleRepository.getFilteredVehicles({}, LARGE_PAGE, tenantId);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'expenses',
    label: 'Expenses',
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'amount', label: 'Amount', type: 'currency', aggregatable: true, groupable: false },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'description', label: 'Description', type: 'string', aggregatable: false, groupable: false },
      { key: 'expense_type_id', label: 'Expense Type', type: 'string', aggregatable: false, groupable: true },
    ],
    fetch: async (tenantId) => {
      const result = await expenseRepository.getFilteredExpenses({}, tenantId, LARGE_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'fuel',
    label: 'Fuel Logs',
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'fuel_volume', label: 'Fuel Volume', type: 'number', aggregatable: true, groupable: false },
      { key: 'cost', label: 'Cost', type: 'currency', aggregatable: true, groupable: false },
      { key: 'odometer', label: 'Odometer', type: 'number', aggregatable: true, groupable: false },
      { key: 'fuel_type', label: 'Fuel Type', type: 'string', aggregatable: false, groupable: true },
      { key: 'station_name', label: 'Station', type: 'string', aggregatable: false, groupable: true },
    ],
    fetch: async (tenantId) => {
      const result = await fuelRepository.getFilteredLogs({}, tenantId, LARGE_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'maintenance',
    label: 'Maintenance Reminders',
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
      const result = await maintenanceRepository.getFilteredReminders({}, tenantId, LARGE_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });

  dataSourceRegistry.register({
    key: 'trips',
    label: 'Trips',
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'mode', label: 'Mode', type: 'string', aggregatable: false, groupable: true },
      { key: 'distance_calculated', label: 'Distance', type: 'number', aggregatable: true, groupable: false },
      { key: 'driver_id', label: 'Driver', type: 'string', aggregatable: false, groupable: true },
    ],
    fetch: async (tenantId) => {
      const result = await tripRepository.getFilteredTrips({}, tenantId, LARGE_PAGE);
      return result.data as unknown as Array<Record<string, unknown>>;
    },
  });
}