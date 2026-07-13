// frontend/modules/reports/types/index.ts
//
// Mirrors modules/reporting/types/*.ts on the server. Duplicated (not
// imported) because server modules (which pull in MongoDB drivers, the
// event bus, etc.) can't be bundled into client code. Keep these in sync
// with the backend types by hand -- if you add a field there, add it here.

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

export type DataSourceKey = 'vehicles' | 'expenses' | 'fuel' | 'maintenance' | 'trips';

export type DataFieldType = 'string' | 'number' | 'currency' | 'date' | 'boolean';

export interface DataSourceFieldDefinition {
  key: string;
  label: string;
  type: DataFieldType;
  aggregatable: boolean;
  groupable: boolean;
}

export interface DataSourceDefinition {
  key: DataSourceKey;
  label: string;
  fields: DataSourceFieldDefinition[];
}

// Static mirror of modules/reporting/registry/bootstrap-data-sources.ts.
// Used to drive the builder UI before/without a round-trip; the backend
// remains the source of truth for what fields actually exist and is
// re-validated on every preview/save.
export const DATA_SOURCES: Record<DataSourceKey, DataSourceDefinition> = {
  vehicles: {
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
  },
  expenses: {
    key: 'expenses',
    label: 'Expenses',
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'amount', label: 'Amount', type: 'currency', aggregatable: true, groupable: false },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'description', label: 'Description', type: 'string', aggregatable: false, groupable: false },
      { key: 'expense_type_id', label: 'Expense Type', type: 'string', aggregatable: false, groupable: true },
    ],
  },
  fuel: {
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
  },
  maintenance: {
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
  },
  trips: {
    key: 'trips',
    label: 'Trips',
    fields: [
      { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
      { key: 'date', label: 'Date', type: 'date', aggregatable: false, groupable: false },
      { key: 'mode', label: 'Mode', type: 'string', aggregatable: false, groupable: true },
      { key: 'distance_calculated', label: 'Distance', type: 'number', aggregatable: true, groupable: false },
      { key: 'driver_id', label: 'Driver', type: 'string', aggregatable: false, groupable: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------

export type ReportAggregationFn = 'sum' | 'avg' | 'count' | 'min' | 'max';
export type ReportFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
export type ReportExportFormat = 'pdf' | 'excel' | 'csv' | 'word' | 'json';

export interface ReportFilterCondition {
  field: string;
  operator: ReportFilterOperator;
  value: unknown;
  value2?: unknown;
}

export interface ReportGroupBy {
  field: string;
  label?: string;
}

export interface ReportAggregation {
  field: string;
  fn: ReportAggregationFn;
  alias: string;
}

export interface ReportSortField {
  field: string;
  direction: 'asc' | 'desc';
}

export type ReportChartType = 'bar' | 'line' | 'pie' | 'table';

export interface ReportChartConfig {
  type: ReportChartType;
  xField?: string;
  yField?: string;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourOfDay: number;
  format: ReportExportFormat;
  recipients: string[];
}

export type PivotAggregator = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ReportPivotConfig {
  rowFields: string[];
  columnField: string;
  valueField: string;
  aggregator: PivotAggregator;
}

export interface ReportDefinition {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters: ReportFilterCondition[];
  groupBy: ReportGroupBy[];
  aggregations: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters?: ReportFilterCondition[];
  groupBy?: ReportGroupBy[];
  aggregations?: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
}

export type ReportDefinitionUpdateDTO = Partial<ReportDefinitionCreateDTO>;

export interface ReportResultColumn {
  key: string;
  label: string;
  type: DataFieldType;
}

export interface ReportGroupSummary {
  key: string;
  label: string;
  count: number;
  aggregates: Record<string, number>;
}

export interface ReportResult {
  columns: ReportResultColumn[];
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  groupSummaries?: ReportGroupSummary[];
}

export interface PivotResult {
  rowKeys: string[];
  columnKeys: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  columnTotals: Record<string, number>;
  grandTotal: number;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export type KPIStatus = 'good' | 'warning' | 'critical' | 'neutral';

export interface KPIThreshold {
  warning: number;
  critical: number;
  direction: 'higher_is_better' | 'lower_is_better';
}

export interface KPIDefinition {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  numerator: ReportAggregation;
  denominator?: ReportAggregation;
  filters: ReportFilterCondition[];
  unit?: string;
  threshold?: KPIThreshold;
  targetValue?: number;
  createdAt: string;
  updatedAt: string;
}

export interface KPIDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  numerator: ReportAggregation;
  denominator?: ReportAggregation;
  filters?: ReportFilterCondition[];
  unit?: string;
  threshold?: KPIThreshold;
  targetValue?: number;
}

export type KPIDefinitionUpdateDTO = Partial<KPIDefinitionCreateDTO>;

export interface KPIEvaluationResult {
  kpiId: string;
  name: string;
  value: number;
  formattedValue: string;
  unit?: string;
  status: KPIStatus;
  targetValue?: number;
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export type DashboardWidgetType = 'kpi' | 'table' | 'chart' | 'pivot';

export interface DashboardWidgetConfig {
  id: string;
  type: DashboardWidgetType;
  title: string;
  kpiDefinitionId?: string;
  reportDefinitionId?: string;
  layout?: { x: number; y: number; w: number; h: number };
}

export interface Dashboard {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  isExecutive: boolean;
  widgets: DashboardWidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCreateDTO {
  name: string;
  description?: string;
  isExecutive?: boolean;
  widgets?: DashboardWidgetConfig[];
}

export type DashboardUpdateDTO = Partial<DashboardCreateDTO>;

export interface DashboardWidgetResult {
  widgetId: string;
  type: DashboardWidgetType;
  title: string;
  data: unknown;
  error?: string;
}

export interface DashboardData {
  dashboardId: string;
  name: string;
  isExecutive: boolean;
  widgets: DashboardWidgetResult[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type ReportTemplateCategory =
  | 'fleet_overview'
  | 'cost_analysis'
  | 'maintenance'
  | 'fuel_efficiency'
  | 'utilization'
  | 'custom';

export interface ReportTemplate {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: ReportTemplateCategory;
  definition: ReportDefinitionCreateDTO;
  isSystemTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplateCreateDTO {
  name: string;
  description?: string;
  category: ReportTemplateCategory;
  definition: ReportDefinitionCreateDTO;
}

// ---------------------------------------------------------------------------
// Executions (exports / scheduled runs)
// ---------------------------------------------------------------------------

export type ExecutionFormat = 'pdf' | 'excel' | 'csv' | 'word' | 'json';
export type ExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ExecutionSourceType = 'report_definition' | 'dashboard';

export interface ReportExecution {
  _id: string;
  tenantId: string;
  name: string;
  sourceType: ExecutionSourceType;
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  status: ExecutionStatus;
  generatedBy: string;
  generatedAt: string;
  drilldownFilters?: ReportFilterCondition[];
  emailedTo?: string[];
  fileUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  downloadCount: number;
  isScheduledRun?: boolean;
}

export interface GenerateExecutionInput {
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  drilldownFilters?: ReportFilterCondition[];
  emailTo?: string[];
}

// ---------------------------------------------------------------------------
// UI-only helpers
// ---------------------------------------------------------------------------

export const REPORT_CATEGORIES: Array<{ key: ReportTemplateCategory | 'executive' | 'ai'; label: string }> = [
  { key: 'executive', label: 'Executive' },
  { key: 'fleet_overview', label: 'Fleet Overview' },
  { key: 'cost_analysis', label: 'Financial' },
  { key: 'fuel_efficiency', label: 'Fuel' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'utilization', label: 'Utilization' },
  { key: 'ai', label: 'AI Insights' },
  { key: 'custom', label: 'Custom' },
];

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}