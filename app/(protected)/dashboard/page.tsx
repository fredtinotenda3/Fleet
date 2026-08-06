// app/(protected)/dashboard/page.tsx

'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { FleetDashboardPage } from '@/frontend/modules/dashboard/pages/FleetDashboardPage';
import { OrganizationDashboardPage } from '@/frontend/modules/organizations/pages/OrganizationDashboardPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * FIX (Phase E, objective 3 -- role-aware dashboards): previously every
 * role landed on the identical FleetDashboardPage, including
 * Organization Owner/Admin, who per spec need org-wide KPIs rather than
 * a single fleet's operational grid.
 *
 * Owner/Admin (and Super Admin, who holds ORG_MANAGE via the
 * unrestricted platform permission set) now route to the existing
 * OrganizationDashboardPage. Every other role renders
 * FleetDashboardPage, whose widget grid is now permission-filtered per
 * widget (WidgetRegistry.ts / WidgetPermissions.ts). Combined with each
 * role's org-unit-scoped queries (TenantContextService, Phase A), that
 * is what actually differentiates a branch/department/fleet/workshop
 * manager's dashboard, a driver's personal view, a mechanic's
 * maintenance-only view, and an accountant's financial view from one
 * another -- rather than duplicating the same widget/query plumbing
 * into eight separate hand-built page components. The remaining
 * distinct case, VIEWER, needs no separate component either: VIEWER
 * holds no *_CREATE/*_EDIT/*_DELETE permission anywhere in
 * rolePermissions, so every action button already renders disabled or
 * hidden per-widget/per-page via the existing permission checks --
 * "read-only" falls out of the permission model already, it isn't
 * something this page needs to enforce separately.
 */
export default function Page() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <PageLoader label="Loading your dashboard" />;
  }

  const isOrgWide = permissionService.hasPermission(user.roles ?? [], Permission.ORG_MANAGE);

  return isOrgWide ? <OrganizationDashboardPage currentUserId={user.id} /> : <FleetDashboardPage />;
}