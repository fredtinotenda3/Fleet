// frontend/modules/reports/utils/columnResolvers.ts
//
// Single source of truth mirror of
// modules/reporting/registry/bootstrap-data-sources.ts and
// frontend/modules/reports/schemas/reportDefinition.ts#REPORT_DATA_SOURCES.
// Field keys below are byte-for-byte identical to what the backend
// registers. If you add a field on the backend, add it here with the
// same key -- do not invent a friendlier client-side name.
//
// FIX (Fix 4): the previous version of this file explicitly excluded
// 'organizations' from FIELD_CATALOG with a note not to add it until
// the backend registered a matching data source -- that registration
// now exists (organizations.data-source.ts, backed by tblorgunits), so
// the exclusion is removed. Also added: the new 'drivers' data source,
// and the orgUnitId/orgUnitName ("Branch") fields now present on
// vehicles/expenses/fuel/trips.

import type { ReportDataSource } from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';

export interface ResolvableField {
  field: string;
  label: string;
  dataType: ReportColumn['dataType'];
  groupable: boolean;
  aggregatable: boolean;
}

const ORG_UNIT_FIELDS: ResolvableField[] = [
  { field: 'orgUnitId', label: 'Org Unit ID', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'orgUnitName', label: 'Branch', dataType: 'string', groupable: true, aggregatable: false },
];

// Mirrors bootstrap-data-sources.ts 'vehicles'
const VEHICLE_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'make', label: 'Make', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'model', label: 'Model', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'year', label: 'Year', dataType: 'number', groupable: true, aggregatable: false },
  { field: 'vehicle_type', label: 'Vehicle Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'fuel_type', label: 'Fuel Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'odometer', label: 'Odometer', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'purchase_date', label: 'Purchase Date', dataType: 'date', groupable: false, aggregatable: false },
  ...ORG_UNIT_FIELDS,
];

// Mirrors bootstrap-data-sources.ts 'trips'
const TRIP_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'date', label: 'Date', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'mode', label: 'Mode', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'distance_calculated', label: 'Distance', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'driver_id', label: 'Driver', dataType: 'string', groupable: true, aggregatable: false },
  ...ORG_UNIT_FIELDS,
];

// Mirrors bootstrap-data-sources.ts 'fuel'
const FUEL_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'date', label: 'Date', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'fuel_volume', label: 'Fuel Volume', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'cost', label: 'Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'odometer', label: 'Odometer', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'fuel_type', label: 'Fuel Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'station_name', label: 'Station', dataType: 'string', groupable: true, aggregatable: false },
  ...ORG_UNIT_FIELDS,
];

// Mirrors bootstrap-data-sources.ts 'maintenance'
const MAINTENANCE_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'title', label: 'Title', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'due_date', label: 'Due Date', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'priority', label: 'Priority', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'category', label: 'Category', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'estimated_cost', label: 'Estimated Cost', dataType: 'currency', groupable: false, aggregatable: true },
];

// Mirrors bootstrap-data-sources.ts 'expenses'
const EXPENSE_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'amount', label: 'Amount', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'date', label: 'Date', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'description', label: 'Description', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'expense_type_id', label: 'Expense Type', dataType: 'string', groupable: true, aggregatable: false },
  ...ORG_UNIT_FIELDS,
];

// Mirrors bootstrap-data-sources.ts drivers.data-source.ts
const DRIVER_FIELDS: ResolvableField[] = [
  { field: 'name', label: 'Name', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'driver_code', label: 'Driver Code', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'email', label: 'Email', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'phone', label: 'Phone', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'license_number', label: 'License Number', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'license_expiry', label: 'License Expiry', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
];

// Mirrors bootstrap-data-sources.ts organizations.data-source.ts
const ORGANIZATION_FIELDS: ResolvableField[] = [
  { field: 'name', label: 'Name', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'type', label: 'Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'code', label: 'Code', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'depth', label: 'Depth', dataType: 'number', groupable: true, aggregatable: false },
  { field: 'managerId', label: 'Manager', dataType: 'string', groupable: true, aggregatable: false },
];

const FIELD_CATALOG: Record<ReportDataSource, ResolvableField[]> = {
  vehicles: VEHICLE_FIELDS,
  trips: TRIP_FIELDS,
  fuel: FUEL_FIELDS,
  maintenance: MAINTENANCE_FIELDS,
  expenses: EXPENSE_FIELDS,
  organizations: ORGANIZATION_FIELDS,
  drivers: DRIVER_FIELDS,
};

export function getFieldsForDataSource(dataSource: ReportDataSource): ResolvableField[] {
  return FIELD_CATALOG[dataSource] ?? [];
}

export function getGroupableFields(dataSource: ReportDataSource): ResolvableField[] {
  return getFieldsForDataSource(dataSource).filter((f) => f.groupable);
}

export function getAggregatableFields(dataSource: ReportDataSource): ResolvableField[] {
  return getFieldsForDataSource(dataSource).filter((f) => f.aggregatable);
}

export function resolveField(dataSource: ReportDataSource, field: string): ResolvableField | undefined {
  return getFieldsForDataSource(dataSource).find((f) => f.field === field);
}

export function toReportColumn(dataSource: ReportDataSource, field: ResolvableField): ReportColumn {
  return {
    id: `${dataSource}.${field.field}`,
    field: field.field,
    label: field.label,
    dataSource,
    dataType: field.dataType,
    aggregation: 'none',
    visible: true,
  };
}