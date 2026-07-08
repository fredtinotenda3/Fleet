// frontend/modules/vehicles/routes/index.ts

export const VEHICLE_ROUTES = {
  list: '/vehicles',
  detail: (id: string) => `/vehicles/${id}`,
} as const;
