// frontend/modules/reports/routes/scheduled.ts

export const SCHEDULED_ROUTES = {
  list: '/reports/scheduled',
  details: (scheduleId: string) => `/reports/scheduled?scheduleId=${scheduleId}`,
} as const;