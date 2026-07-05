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

/**
 * A blueprint an organization can clone into a live ReportDefinition via
 * ReportTemplateService.instantiate(). System templates (isSystemTemplate:
 * true) ship pre-seeded and are visible to every tenant; orgs may also
 * save their own report definitions as reusable templates.
 */
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
}