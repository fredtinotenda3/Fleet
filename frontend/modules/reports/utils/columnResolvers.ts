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

// WAVE 3, R.3.8. Mirrors bootstrap-data-sources.ts/data-sources/alerts.data-source.ts.
// No `driver` field: TelematicsAlert carries no stored driver association,
// and joining to the vehicle's CURRENT driver would misattribute a
// historical alert -- see that file's header for the full reasoning.
const ALERT_FIELDS: ResolvableField[] = [
  { field: 'type', label: 'Alert Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'severity', label: 'Severity', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'message', label: 'Message', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'value', label: 'Value', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'threshold', label: 'Threshold', dataType: 'number', groupable: false, aggregatable: false },
  { field: 'timestamp', label: 'Occurred At', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'acknowledgedAt', label: 'Acknowledged At', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  ...ORG_UNIT_FIELDS,
];

// WAVE 3, R.3.6. Mirrors bootstrap-data-sources.ts/data-sources/
// workorders.data-source.ts. `source` is labeled "Origin" (not "Type")
// -- WorkOrder has no formal category/classification field, so this is
// the closest genuine proxy, not a renamed taxonomy. No "Overdue"/SLA
// field: WorkOrder has no due-date/SLA field to derive one from.
const WORKORDER_FIELDS: ResolvableField[] = [
  { field: 'title', label: 'Title', dataType: 'string', groupable: false, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'priority', label: 'Priority', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'source', label: 'Origin', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'bayName', label: 'Bay', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'mechanicName', label: 'Assigned Mechanic', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'openedAt', label: 'Opened At', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'startedAt', label: 'Started At', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'completedAt', label: 'Completed At', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'turnaroundHours', label: 'Turnaround (Hours)', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'laborHours', label: 'Labor Hours', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'laborCost', label: 'Labor Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'partsCost', label: 'Parts Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'totalCost', label: 'Total Cost', dataType: 'currency', groupable: false, aggregatable: true },
  ...ORG_UNIT_FIELDS,
];

const FIELD_CATALOG: Record<ReportDataSource, ResolvableField[]> = {
  vehicles: VEHICLE_FIELDS,
  trips: TRIP_FIELDS,
  fuel: FUEL_FIELDS,
  maintenance: MAINTENANCE_FIELDS,
  expenses: EXPENSE_FIELDS,
  organizations: ORGANIZATION_FIELDS,
  drivers: DRIVER_FIELDS,
  alerts: ALERT_FIELDS,
  workorders: WORKORDER_FIELDS,
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