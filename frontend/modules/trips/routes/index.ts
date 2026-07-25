// ========================================
// FILE: frontend/modules/trips/routes/index.ts
// ========================================

export const TRIP_ROUTES = {
  list: '/trips',
  analytics: '/trips/analytics',
  detail: (id: string) => `/trips/${id}`,
} as const;