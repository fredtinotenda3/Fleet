// shared/config/constants.ts

export const APP_CONFIG = {
  name: 'Fleet Management System',
  version: process.env.npm_package_version || '2.0.0',
  environment: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '/api',
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
} as const;

export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    session: '/auth/session',
  },
  vehicles: {
    base: '/vehicles',
    details: (id: string) => `/vehicles/${id}`,
    stats: '/vehicles/stats',
  },
  expenses: {
    base: '/expenses',
    details: (id: string) => `/expenses/${id}`,
    types: '/expense-types',
  },
  fuel: {
    base: '/fuellogs',
    details: (id: string) => `/fuellogs/${id}`,
  },
  maintenance: {
    base: '/reminders',
    details: (id: string) => `/reminders/${id}`,
  },
  trips: {
    base: '/trips',
    details: (id: string) => `/trips/${id}`,
  },
  meter: {
    base: '/meterlogs',
    details: (id: string) => `/meterlogs/${id}`,
    last: '/meterlogs/last',
  },
  units: '/units',
  analytics: {
    dashboard: '/analytics/dashboard',
    fleet: '/analytics/fleet',
    expenses: '/analytics/expenses',
    fuel: '/analytics/fuel',
  },
  reports: {
    base: '/reports',
    export: '/reports/export',
    schedule: '/reports/schedule',
  },
} as const;