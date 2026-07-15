// frontend/modules/reports/routes/builder.ts
// Sub-routes and query-param keys used inside the custom Report Builder flow.

export const BUILDER_ROUTES = {
  new: '/reports/builder',
  edit: (reportId: string) => `/reports/builder/${reportId}`,
  fromTemplate: (templateId: string) => `/reports/builder?templateId=${templateId}`,
} as const;

export const BUILDER_QUERY_PARAMS = {
  templateId: 'templateId',
  step: 'step',
} as const;

export type BuilderStep = 'columns' | 'filters' | 'groupBy' | 'sort' | 'chart' | 'preview' | 'save';

export const BUILDER_STEPS: BuilderStep[] = ['columns', 'filters', 'groupBy', 'sort', 'chart', 'preview', 'save'];