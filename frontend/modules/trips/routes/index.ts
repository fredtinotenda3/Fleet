// frontend/modules/trips/routes/index.ts

export const TRIP_ROUTES = {
  list: '/trips',
  detail: (id: string) => `/trips/${id}`,
} as const;