// frontend/modules/fuel/routes/index.ts

export const FUEL_ROUTES = {
  dashboard: '/fuel',
  list: '/fuel/logs',
  detail: (id: string) => `/fuel/logs/${id}`,
  edit: (id: string) => `/fuel/logs/${id}/edit`,
  create: '/fuel/logs/create',
  vehicleHistory: (plate: string) => `/fuel/vehicles/${encodeURIComponent(plate)}`,
} as const;