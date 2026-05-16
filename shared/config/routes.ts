// shared/config/routes.ts

export const ROUTES = {
  public: {
    login: '/auth/login',
    register: '/auth/register',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },
  protected: {
    dashboard: '/dashboard',
    vehicles: '/vehicles',
    vehicleDetails: (licensePlate?: string) => 
      licensePlate ? `/vehicles?selectedVehicle=${licensePlate}` : '/vehicles',
    expenses: '/expenses',
    fuel: '/fuel',
    meter: '/meter',
    maintenance: '/maintenance',
    trips: '/trips',
    details: '/details',
    reports: '/reports',
    settings: '/settings',
    users: '/users',
    analytics: '/analytics',
  },
  api: {
    auth: '/api/auth',
    vehicles: '/api/vehicles',
    expenses: '/api/expenses',
    fuel: '/api/fuellogs',
    meter: '/api/meterlogs',
    reminders: '/api/reminders',
    trips: '/api/trips',
    units: '/api/units',
    expenseTypes: '/api/expense-types',
  },
} as const;

export type AppRoute = typeof ROUTES;