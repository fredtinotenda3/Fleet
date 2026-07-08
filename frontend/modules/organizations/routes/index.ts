// frontend/modules/organizations/routes/index.ts

export const ORGANIZATION_ROUTES = {
  dashboard: '/organizations/dashboard',
  select: '/organizations/select',
  settings: {
    root: '/organizations/settings',
    general: '/organizations/settings/general',
    branding: '/organizations/settings/branding',
    regional: '/organizations/settings/regional',
    businessHours: '/organizations/settings/business-hours',
    tax: '/organizations/settings/tax',
    notifications: '/organizations/settings/notifications',
    security: '/organizations/settings/security',
  },
  members: {
    root: '/organizations/members',
    invitations: '/organizations/members/invitations',
  },
  roles: '/organizations/roles',
  teams: '/organizations/teams',
  audit: '/organizations/audit-log',
  analytics: '/organizations/analytics',
  advanced: {
    root: '/organizations/advanced',
    featureFlags: '/organizations/advanced?tab=feature-flags',
    billing: '/organizations/advanced?tab=billing',
    plugins: '/organizations/advanced?tab=plugins',
    ai: '/organizations/advanced?tab=ai',
    reporting: '/organizations/advanced?tab=reporting',
  },
  invite: (token: string) => `/organizations/invite/${token}`,
} as const;

export function isOrganizationRoute(pathname: string): boolean {
  return pathname.startsWith('/organizations');
}