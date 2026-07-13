// frontend/modules/reports/utils/columnResolvers.ts
//
// Client-side mirror of the fields registered per data source in
// modules/reporting/registry/DataSourceRegistry.ts. The backend is the
// source of truth and validates every field against this registry at
// preview/save time (report-query.engine.ts) - this catalog only drives
// what the builder UI *offers*, so a stale entry here fails safe as a
// backend 400, never as silently wrong data.
//
// NOTE: if DataSourceRegistry.ts adds/renames a field, update this file to
// match. Keeping it static (vs. an extra network round trip) keeps the
// builder responsive while switching data sources.

import type { ReportDataSource } from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';

export interface ResolvableField {
  field: string;
  label: string;
  dataType: ReportColumn['dataType'];
  groupable: boolean;
  aggregatable: boolean;
}

const VEHICLE_FIELDS: ResolvableField[] = [
  { field: 'plate', label: 'License Plate', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'make', label: 'Make', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'model', label: 'Model', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'year', label: 'Year', dataType: 'number', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'department', label: 'Department', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'odometer', label: 'Odometer', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'utilizationRate', label: 'Utilization Rate', dataType: 'percent', groupable: false, aggregatable: true },
  { field: 'downtimeHours', label: 'Downtime (hrs)', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'totalOperatingCost', label: 'Total Operating Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'costPerKm', label: 'Cost per Km', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'acquisitionDate', label: 'Acquisition Date', dataType: 'date', groupable: true, aggregatable: false },
];

const TRIP_FIELDS: ResolvableField[] = [
  { field: 'vehiclePlate', label: 'Vehicle', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'driverName', label: 'Driver', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'startedAt', label: 'Start Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'completedAt', label: 'End Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'distanceKm', label: 'Distance (km)', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'durationMinutes', label: 'Duration (min)', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'revenue', label: 'Revenue', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'cost', label: 'Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'profitability', label: 'Profitability', dataType: 'currency', groupable: false, aggregatable: true },
];

const FUEL_FIELDS: ResolvableField[] = [
  { field: 'vehiclePlate', label: 'Vehicle', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'stationName', label: 'Station', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'fuelType', label: 'Fuel Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'date', label: 'Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'liters', label: 'Liters', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'costPerLiter', label: 'Cost / Liter', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'totalCost', label: 'Total Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'fuelEconomy', label: 'Fuel Economy (km/l)', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'cardId', label: 'Fuel Card', dataType: 'string', groupable: true, aggregatable: false },
];

const MAINTENANCE_FIELDS: ResolvableField[] = [
  { field: 'vehiclePlate', label: 'Vehicle', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'type', label: 'Maintenance Type', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'scheduledDate', label: 'Scheduled Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'completedDate', label: 'Completed Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'cost', label: 'Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'vendor', label: 'Vendor', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'isOverdue', label: 'Overdue', dataType: 'boolean', groupable: true, aggregatable: false },
];

const EXPENSE_FIELDS: ResolvableField[] = [
  { field: 'vehiclePlate', label: 'Vehicle', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'category', label: 'Category', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'date', label: 'Date', dataType: 'date', groupable: true, aggregatable: false },
  { field: 'amount', label: 'Amount', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'department', label: 'Department', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'status', label: 'Status', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'approvedBy', label: 'Approved By', dataType: 'string', groupable: true, aggregatable: false },
];

const ORGANIZATION_FIELDS: ResolvableField[] = [
  { field: 'name', label: 'Organization', dataType: 'string', groupable: true, aggregatable: false },
  { field: 'vehicleCount', label: 'Vehicle Count', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'totalCost', label: 'Total Cost', dataType: 'currency', groupable: false, aggregatable: true },
  { field: 'activeUsers', label: 'Active Users', dataType: 'number', groupable: false, aggregatable: true },
  { field: 'plan', label: 'Billing Plan', dataType: 'string', groupable: true, aggregatable: false },
];

const FIELD_CATALOG: Record<ReportDataSource, ResolvableField[]> = {
  vehicles: VEHICLE_FIELDS,
  trips: TRIP_FIELDS,
  fuel: FUEL_FIELDS,
  maintenance: MAINTENANCE_FIELDS,
  expenses: EXPENSE_FIELDS,
  organizations: ORGANIZATION_FIELDS,
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