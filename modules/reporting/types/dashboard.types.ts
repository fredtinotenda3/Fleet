// modules/reporting/types/dashboard.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type DashboardWidgetType = 'kpi' | 'table' | 'chart' | 'pivot';

export interface DashboardWidgetConfig {
  id: string;
  type: DashboardWidgetType;
  title: string;
  kpiDefinitionId?: string;
  reportDefinitionId?: string;
  layout?: { x: number; y: number; w: number; h: number };
}

export interface Dashboard extends BaseEntity {
  name: string;
  description?: string;
  isExecutive: boolean;
  widgets: DashboardWidgetConfig[];
}

export interface DashboardCreateDTO {
  name: string;
  description?: string;
  isExecutive?: boolean;
  widgets?: DashboardWidgetConfig[];
}

export interface DashboardUpdateDTO extends Partial<DashboardCreateDTO> {
  _id?: string;
}

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
  generatedAt: Date;
}