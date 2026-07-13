// frontend/modules/reports/services/reports.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { API_ENDPOINTS } from '@/shared/config/constants';
import type {
  Dashboard,
  DashboardCreateDTO,
  DashboardUpdateDTO,
  DashboardData,
  KPIDefinition,
  KPIDefinitionCreateDTO,
  KPIDefinitionUpdateDTO,
  KPIEvaluationResult,
  ReportDefinition,
  ReportDefinitionCreateDTO,
  ReportDefinitionUpdateDTO,
  ReportResult,
  PivotResult,
  ReportTemplate,
  ReportTemplateCreateDTO,
  ReportExecution,
  GenerateExecutionInput,
  PaginatedResult,
} from '../types';

const R = API_ENDPOINTS.reporting;

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export const dashboardsApi = {
  list: (executiveOnly = false): Promise<Dashboard[]> =>
    apiClient.get<Dashboard[]>(R.dashboards.base, { params: { executive: executiveOnly } }),

  get: (id: string): Promise<Dashboard> => apiClient.get<Dashboard>(R.dashboards.details(id)),

  render: (id: string): Promise<DashboardData> => apiClient.get<DashboardData>(R.dashboards.render(id)),

  create: (data: DashboardCreateDTO): Promise<Dashboard> => apiClient.post<Dashboard>(R.dashboards.base, data),

  update: (id: string, data: DashboardUpdateDTO): Promise<Dashboard> =>
    apiClient.put<Dashboard>(R.dashboards.details(id), data),

  remove: (id: string): Promise<{ message: string }> =>
    apiClient.delete<{ message: string }>(R.dashboards.details(id)),
};

// ---------------------------------------------------------------------------
// KPI definitions
// ---------------------------------------------------------------------------

export const kpisApi = {
  list: (): Promise<KPIDefinition[]> => apiClient.get<KPIDefinition[]>(R.kpis.base),

  get: (id: string): Promise<KPIDefinition> => apiClient.get<KPIDefinition>(R.kpis.details(id)),

  evaluate: (id: string): Promise<KPIEvaluationResult> =>
    apiClient.get<KPIEvaluationResult>(R.kpis.evaluate(id)),

  evaluateAll: (): Promise<KPIEvaluationResult[]> =>
    apiClient.get<KPIEvaluationResult[]>(R.kpis.evaluateAll),

  create: (data: KPIDefinitionCreateDTO): Promise<KPIDefinition> =>
    apiClient.post<KPIDefinition>(R.kpis.base, data),

  update: (id: string, data: KPIDefinitionUpdateDTO): Promise<KPIDefinition> =>
    apiClient.put<KPIDefinition>(R.kpis.details(id), data),

  remove: (id: string): Promise<{ message: string }> =>
    apiClient.delete<{ message: string }>(R.kpis.details(id)),
};

// ---------------------------------------------------------------------------
// Report definitions (the custom report builder)
// ---------------------------------------------------------------------------

export const reportDefinitionsApi = {
  list: (): Promise<ReportDefinition[]> => apiClient.get<ReportDefinition[]>(R.definitions.base),

  get: (id: string): Promise<ReportDefinition> => apiClient.get<ReportDefinition>(R.definitions.details(id)),

  preview: (id: string): Promise<ReportResult> => apiClient.get<ReportResult>(R.definitions.preview(id)),

  previewPivot: (id: string): Promise<PivotResult> => apiClient.get<PivotResult>(R.definitions.pivot(id)),

  drilldown: (id: string, groupValues: Record<string, unknown>): Promise<ReportResult> =>
    apiClient.post<ReportResult>(R.definitions.drilldown(id), { groupValues }),

  duplicate: (id: string): Promise<ReportDefinition> =>
    apiClient.post<ReportDefinition>(R.definitions.duplicate(id)),

  create: (data: ReportDefinitionCreateDTO): Promise<ReportDefinition> =>
    apiClient.post<ReportDefinition>(R.definitions.base, data),

  update: (id: string, data: ReportDefinitionUpdateDTO): Promise<ReportDefinition> =>
    apiClient.put<ReportDefinition>(R.definitions.details(id), data),

  remove: (id: string): Promise<{ message: string }> =>
    apiClient.delete<{ message: string }>(R.definitions.details(id)),
};

// ---------------------------------------------------------------------------
// Report templates
// ---------------------------------------------------------------------------

export const reportTemplatesApi = {
  list: (): Promise<ReportTemplate[]> => apiClient.get<ReportTemplate[]>(R.templates.base),

  get: (id: string): Promise<ReportTemplate> => apiClient.get<ReportTemplate>(R.templates.details(id)),

  instantiate: (id: string, name?: string): Promise<ReportDefinition> =>
    apiClient.post<ReportDefinition>(R.templates.instantiate(id), name ? { name } : {}),

  create: (data: ReportTemplateCreateDTO): Promise<ReportTemplate> =>
    apiClient.post<ReportTemplate>(R.templates.base, data),

  remove: (id: string): Promise<{ message: string }> =>
    apiClient.delete<{ message: string }>(R.templates.details(id)),
};

// ---------------------------------------------------------------------------
// Executions (ad-hoc exports + the Export Center / history)
// ---------------------------------------------------------------------------

export const reportExecutionsApi = {
  list: (page = 1, limit = 20): Promise<PaginatedResult<ReportExecution>> =>
    apiClient.get<PaginatedResult<ReportExecution>>(R.executions.base, { params: { page, limit } }),

  get: (id: string): Promise<ReportExecution> => apiClient.get<ReportExecution>(R.executions.details(id)),

  generate: (data: GenerateExecutionInput): Promise<ReportExecution> =>
    apiClient.post<ReportExecution>(R.executions.base, data),

  /**
   * Downloads the generated file as a Blob. Bypasses apiClient because the
   * download route (report-execution.controller.ts#download) returns a raw
   * binary payload, not the {success,data} JSON envelope apiClient expects.
   */
  async download(id: string, filename: string): Promise<void> {
    const response = await fetch(R.executions.download(id), { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};