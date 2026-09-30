// frontend/modules/expenses/routes/index.ts

export const EXPENSE_ROUTES = {
  dashboard: '/expenses',
  list: '/expenses/list',
  create: '/expenses/create',
  detail: (id: string) => `/expenses/${id}`,
  edit: (id: string) => `/expenses/${id}/edit`,
  analytics: '/expenses/analytics',
  vehicleHistory: (licensePlate: string) => `/expenses/vehicles/${encodeURIComponent(licensePlate)}`,
  intelligenceReport: '/expenses/intelligence-report',
} as const;