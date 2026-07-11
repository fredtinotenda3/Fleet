// modules/reporting/types/report-template.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { ReportDefinitionCreateDTO } from './report-definition.types';

export type ReportTemplateCategory =
  | 'fleet_overview'
  | 'cost_analysis'
  | 'maintenance'
  | 'fuel_efficiency'
  | 'utilization'
  | 'custom';

export interface ReportTemplate extends BaseEntity {
  name: string;
  description?: string;
  category: ReportTemplateCategory;
  definition: ReportDefinitionCreateDTO;
  isSystemTemplate: boolean;
}

export interface ReportTemplateCreateDTO {
  name: string;
  description?: string;
  category: ReportTemplateCategory;
  definition: ReportDefinitionCreateDTO;
  isSystemTemplate?: boolean;
}