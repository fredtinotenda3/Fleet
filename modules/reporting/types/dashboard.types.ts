// modules/reporting/types/dashboard.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type WidgetType = 'kpi' | 'chart' | 'table' | 'pivot';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  /** Required for 'chart' | 'table' | 'pivot' widgets. */
  reportDefinitionId?: string;
  /** Required for 'kpi' widgets. */
  kpiDefinitionId?: string;
  layout: WidgetLayout;
}

/**
 * A dashboard is a saved arrangement of widgets, each bound to either a
 * ReportDefinition (chart/table/pivot) or a KPIDefinition (kpi tile).
 * `isExecutive` flags a curated, KPI-forward dashboard intended for
 * leadership consumption (drives PDF export styling and default
 * read-only sharing).
 */
export interface Dashboard extends BaseEntity {
  name: string;
  description?: string;
  isExecutive: boolean;
  widgets: DashboardWidget[];
}

export interface DashboardCreateDTO {
  name: string;
  description?: string;
  isExecutive?: boolean;
  widgets?: DashboardWidget[];
}

export interface DashboardUpdateDTO extends Partial<DashboardCreateDTO> {
  _id: string;
}

export interface DashboardWidgetResult {
  widgetId: string;
  type: WidgetType;
  title: string;
  data: unknown;
  error?: string;
}

export interface DashboardData {
  dashboardId: string;
  name: string;
  isExecutive: boolean;
  widgets: DashboardWidgetResult[];
  generatedAt: Date;
}