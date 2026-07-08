// frontend/modules/organizations/nav.ts
//
// Data-driven nav item definitions for the Organizations module's admin
// surface. Exported separately from routes/index.ts so a Sidebar
// component can import icons/permission gates without pulling in every
// route helper, and so this list is the single place to add/remove an
// admin nav entry.

import { Settings2, ShieldCheck, LineChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ORGANIZATION_ROUTES } from './routes';
import type { OrganizationRole } from './types';
import { canManageMembers } from './utils';

export interface OrganizationNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Returns true if the given role should see this nav entry. */
  isVisible: (role: OrganizationRole) => boolean;
}

export const ADVANCED_ADMIN_NAV_ITEMS: OrganizationNavItem[] = [
  {
    key: 'advanced-settings',
    href: ORGANIZATION_ROUTES.advanced.root,
    label: 'Advanced settings',
    icon: Settings2,
    isVisible: (role) => canManageMembers(role),
  },
  {
    key: 'audit-log',
    href: ORGANIZATION_ROUTES.audit,
    label: 'Audit log',
    icon: ShieldCheck,
    isVisible: (role) => canManageMembers(role),
  },
  {
    key: 'analytics',
    href: ORGANIZATION_ROUTES.analytics,
    label: 'Analytics',
    icon: LineChart,
    isVisible: (role) => canManageMembers(role),
  },
];

export function getVisibleAdvancedAdminNavItems(role: OrganizationRole): OrganizationNavItem[] {
  return ADVANCED_ADMIN_NAV_ITEMS.filter((item) => item.isVisible(role));
}