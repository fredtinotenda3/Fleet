// shared/config/constants.ts

export const APP_CONFIG = {
  name: 'Fleet Management System',
  version: process.env.npm_package_version || '2.0.0',
  environment: process.env.NODE_ENV || 'development',
  // FIXED: Changed from '/api' to '' since all API routes already include /api prefix
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
} as const;

export const PAGINATION_CONFIG = {
  defaultPageSize: 10,
  pageSizeOptions: [10, 25, 50, 100],
  maxPageSize: 100,
} as const;

export const DATE_CONFIG = {
  defaultFormat: 'MMM dd, yyyy',
  apiFormat: 'yyyy-MM-dd',
  timezone: 'UTC',
} as const;

export const VEHICLE_CONFIG = {
  serviceIntervalKm: 10_000,
  statusOptions: ['active', 'inactive', 'maintenance'] as const,
  fuelTypes: [
    'Petrol',
    'Diesel',
    'Electric',
    'Hybrid',
    'LPG',
    'CNG',
    'Hydrogen',
  ] as const,
  vehicleTypes: [
    'Car',
    'Truck',
    'Van',
    'Bus',
    'Motorcycle',
    'Tractor',
    'Trailer',
    'SUV',
    'Sedan',
    'Hatchback',
  ] as const,
} as const;

export const MAINTENANCE_CONFIG = {
  recurrenceOptions: [
    { value: 'none', label: 'No recurrence' },
    { value: '7d', label: 'Every week' },
    { value: '14d', label: 'Every 2 weeks' },
    { value: '30d', label: 'Every month' },
    { value: '90d', label: 'Every 3 months' },
    { value: '180d', label: 'Every 6 months' },
    { value: '365d', label: 'Every year' },
  ] as const,
  priorityOptions: ['low', 'medium', 'high', 'critical'] as const,
} as const;

export const EXPENSE_CONFIG = {
  categories: [
    'Fuel',
    'Maintenance',
    'Insurance',
    'Registration',
    'Repairs',
    'Other',
  ] as const,
} as const;

export const CURRENCY_CONFIG = {
  code: 'USD',
  symbol: '$',
  locale: 'en-US',
} as const;

export const DISTANCE_CONFIG = {
  defaultUnit: 'km',
  units: [
    { id: 'km', name: 'Kilometers', symbol: 'km' },
    { id: 'mi', name: 'Miles', symbol: 'mi' },
  ] as const,
} as const;

export const STORAGE_KEYS = {
  theme: 'fleet-theme',
  sidebarCollapsed: 'sidebar-collapsed',
  recentVehicles: 'recent-vehicles',
  userPreferences: 'user-preferences',
  // NEW: local UI state for the Reports Center (pinned reports, favorite
  // templates, last-used builder draft). Never used to store report data
  // itself -- report results always come from the API, filtered/scoped
  // server-side per tenant.
  reportsFavorites: 'reports-favorites',
  reportsPinned: 'reports-pinned',
  reportsBuilderDraft: 'reports-builder-draft',
} as const;

// FIXED: All API endpoints already include /api prefix
export const API_ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
    session: '/api/auth/session',
  },
  vehicles: {
    base: '/api/vehicles',
    details: (id: string) => `/api/vehicles/${id}`,
    stats: '/api/vehicles/stats',
    analytics: '/api/vehicles/analytics',
  },
  expenses: {
    base: '/api/expenses',
    details: (id: string) => `/api/expenses/${id}`,
    types: '/api/expense-types',
  },
  fuel: {
    base: '/api/fuellogs',
    details: (id: string) => `/api/fuellogs/${id}`,
  },
  maintenance: {
    base: '/api/reminders',
    details: (id: string) => `/api/reminders/${id}`,
  },
  trips: {
    base: '/api/trips',
    details: (id: string) => `/api/trips/${id}`,
    stats: '/api/trips/stats',
  },
  meter: {
    base: '/api/meterlogs',
    details: (id: string) => `/api/meterlogs/${id}`,
    last: '/api/meterlogs/last',
  },
  units: '/api/units',
  analytics: {
    dashboard: '/api/analytics/dashboard',
    fleet: '/api/analytics/fleet',
    expenses: '/api/analytics/expenses',
    fuel: '/api/analytics/fuel',
  },
  ai: {
    dashboard: '/api/ai/dashboard',
    driverRisk: '/api/ai/driver-risk',
    expenseAnomalies: '/api/ai/expense-anomalies',
    fleetHealth: '/api/ai/fleet-health',
    fuelFraud: '/api/ai/fuel-fraud',
    predictiveMaintenance: '/api/ai/predictive-maintenance',
  },
  // NEW: Enterprise Reporting Platform (modules/reporting). Replaces the
  // old `reports` block below, which pointed at the now-deleted
  // modules/reports legacy 5-canned-report generator. See the Reports
  // Center audit notes for the deletion rationale -- report-builder.service.ts
  // + report-execution.service.ts + the CSV/Excel/PDF/Word generators
  // supersede it with an arbitrary-data-source, arbitrary-format engine.
  reporting: {
    dashboards: {
      base: '/api/reporting/dashboards',
      details: (id: string) => `/api/reporting/dashboards/${id}`,
      render: (id: string) => `/api/reporting/dashboards/${id}/data`,
    },
    kpis: {
      base: '/api/reporting/kpis',
      details: (id: string) => `/api/reporting/kpis/${id}`,
      evaluate: (id: string) => `/api/reporting/kpis/${id}/evaluate`,
      evaluateAll: '/api/reporting/kpis/evaluate-all',
    },
    definitions: {
      base: '/api/reporting/definitions',
      details: (id: string) => `/api/reporting/definitions/${id}`,
      preview: (id: string) => `/api/reporting/definitions/${id}/preview`,
      pivot: (id: string) => `/api/reporting/definitions/${id}/pivot`,
      drilldown: (id: string) => `/api/reporting/definitions/${id}/drilldown`,
      duplicate: (id: string) => `/api/reporting/definitions/${id}/duplicate`,
    },
    executions: {
      base: '/api/reporting/executions',
      details: (id: string) => `/api/reporting/executions/${id}`,
      download: (id: string) => `/api/reporting/executions/${id}/download`,
    },
    templates: {
      base: '/api/reporting/templates',
      details: (id: string) => `/api/reporting/templates/${id}`,
      instantiate: (id: string) => `/api/reporting/templates/${id}/instantiate`,
    },
  },
} as const;