// frontend/modules/reports/routes/exports.ts

export const EXPORT_ROUTES = {
  center: '/reports/exports',
  jobDetails: (executionId: string) => `/reports/exports?executionId=${executionId}`,
} as const;