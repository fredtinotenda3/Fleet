// frontend/modules/maintenance/routes/index.ts

export const MAINTENANCE_ROUTES = {
  dashboard: '/maintenance',
  list: '/maintenance/list',
  detail: (id: string) => `/maintenance/${id}`,
  create: '/maintenance/create',
  edit: (id: string) => `/maintenance/${id}/edit`,
  vehicleHistory: (licensePlate: string) => `/maintenance/vehicles/${encodeURIComponent(licensePlate)}`,
  upcoming: '/maintenance/upcoming',
  overdue: '/maintenance/overdue',
  calendar: '/maintenance/calendar',
  analytics: '/maintenance/analytics',
} as const;