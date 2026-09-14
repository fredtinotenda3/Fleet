// ========================================
// FILE: frontend/modules/trips/routes/index.ts
// ========================================

export const TRIP_ROUTES = {
  list: '/trips',
  analytics: '/trips/analytics',
  detail: (id: string) => `/trips/${id}`,
  /**
   * WAVE 1 PART 2, item 3. Mirrors FUEL_ROUTES.vehicleHistory /
   * MAINTENANCE_ROUTES.vehicleHistory / EXPENSE_ROUTES.vehicleHistory --
   * a dedicated per-vehicle history route, not a query-param filter on
   * the general list page, matching the established convention for
   * "this vehicle's records" screens in this codebase.
   */
  vehicleHistory: (licensePlate: string) => `/trips/vehicles/${encodeURIComponent(licensePlate)}`,
} as const;