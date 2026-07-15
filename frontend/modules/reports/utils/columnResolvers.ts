// frontend/modules/reports/utils/columnResolvers.ts
//
// FIX (Critical - field catalog drift causing save/preview 400s and wrong
// data): this file previously defined its own camelCase field names
// (vehiclePlate, costPerLiter, fuelEconomy, cardId, etc.) that DO NOT EXIST
// in the backend's DataSourceRegistry (modules/reporting/registry/
// bootstrap-data-sources.ts registers snake_case: license_plate, cost,
// fuel_volume, odometer, fuel_type, station_name). Every report saved
// against the old catalog stored field names the query engine cannot
// resolve, and any aggregation whose column.label collided with another
// column's label (both defaulting to the same alias, e.g. two columns
// both landing on "Liters") produced duplicate aggregation aliases, which
// report-definition.schema.ts rejects -> PUT /api/reporting/definitions/
// [id] 400.
//
// This file is now the single source of truth mirror of
// modules/reporting/registry/bootstrap-data-sources.ts and
// frontend/modules/reports/types/index.ts#DATA_SOURCES. Field keys below
// are byte-for-byte identical to what the backend registers. If you add a
// field on the backend, add it here with the same key -- do not invent a
// friendlier client-side name.

import type { ReportDataSource } from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';

export interface ResolvableField {
  field: string;
  label: string;
  dataType: ReportColumn['dataType'];
  groupable: boolean;
  aggregatable: boolean;
}

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
];

// Mirrors bootstrap-data-sources.ts 'trips'
const TRIP_FIELDS: ResolvableField[] = [
  { field: 'license_plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'date', label: 'Date', dataType: 'date', groupable: false, aggregatable: false },
  { field: 'mode', label: 'Mode', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'distance_calculated', label: 'Distance', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'driver_id', label: 'Driver', dataType: 'string', groupable: true, aggregatable: false },
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
];

// NOTE: 'organizations' is intentionally NOT included -- the backend
// DataSourceRegistry has no entry for it (see the note already in
// queryBuilder.ts). Do not add it here until modules/reporting/registry/
// bootstrap-data-sources.ts registers it, or saves against it will 400.
const FIELD_CATALOG: Record<Exclude<ReportDataSource, 'organizations'>, ResolvableField[]> = {
  vehicles: VEHICLE_FIELDS,
  trips: TRIP_FIELDS,
  fuel: FUEL_FIELDS,
  maintenance: MAINTENANCE_FIELDS,
  expenses: EXPENSE_FIELDS,
};

export function getFieldsForDataSource(dataSource: ReportDataSource): ResolvableField[] {
  return (FIELD_CATALOG as Record<string, ResolvableField[]>)[dataSource] ?? [];
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