// frontend/shared/ui/navigation/Sidebar.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  Route,
  Fuel as FuelIcon,
  Wallet,
  Wrench,
  ClipboardList,
  ClipboardCheck,
  Warehouse,
  Boxes,
  ShoppingCart,
  Building2,
  ShieldCheck,
  Timer,
  FileBarChart,
  LineChart,
  Users,
  Shield,
  KeyRound,
  ScrollText,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Monitor,
  AlertOctagon,
  MapPin,
  Activity,
  GitBranch,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { OrganizationAdvancedNavLinks } from '@/frontend/modules/organizations/components/nav/OrganizationAdvancedNavLinks';
import { Permission, permissionService } from '@/server/permissions/roles';

interface NavChildItem {
  key: string;
  label: string;
  href: string;
  /** Same permission semantics as the parent. Omit = inherit visibility from the parent. */
  permissions?: Permission[];
}

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Item is visible if the user holds ANY of these permissions. Omit = visible to every authenticated user. */
  permissions?: Permission[];
  /**
   * Sub-pages, revealed when the section is active. 19 real pages
   * (/fuel/stations, /fuel/cards, /maintenance/overdue, /expenses/analytics,
   * ...) shipped with no navigation entry at all and were reachable only by
   * typing the URL. Children surface them without adding a top-level row
   * for each.
   */
  children?: NavChildItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * FIX (Phase E nav wiring, objective 2): every gated item here used to
 * carry a `roles: string[]` list -- most recently
 * `ORG_ADMIN_ROLES = ['super_admin', 'organization_owner',
 * 'organization_admin']`, a hand-maintained duplicate of role strings
 * that had already drifted once (it granted Fleet Manager full
 * org-administration nav, and didn't recognize ORGANIZATION_ADMIN when
 * that role was added in Phase A) -- the exact bug already found and
 * fixed in middleware.ts's /admin gate. There is no longer any local
 * role list in this file. Every item below is gated on a `Permission`
 * from server/permissions/roles.ts and resolved through the same
 * permissionService.hasAnyPermission every other authorization check
 * in the app uses, so it cannot go out of sync with rolePermissions
 * again -- if rolePermissions changes, this nav updates automatically.
 *
 * Permission choices below deliberately use the narrowest permission
 * that still matches the previous ORG_ADMIN_ROLES-only visibility
 * (verified against rolePermissions in server/permissions/roles.ts: no
 * BRANCH_MANAGER/DEPARTMENT_MANAGER/FLEET_MANAGER/WORKSHOP_MANAGER
 * holds ORG_MANAGE, ORG_SETTINGS, ORG_UNIT_MANAGE, or API_KEY_MANAGE),
 * e.g. "Roles & Permissions" is gated on ORG_MANAGE rather than
 * CUSTOM_ROLE_VIEW, because FLEET_MANAGER already holds
 * CUSTOM_ROLE_VIEW and gating on it would have silently regressed
 * exactly the leak this fix removes.
 */
function isItemVisible(item: NavItem, roles: string[]): boolean {
  if (!item.permissions || item.permissions.length === 0) return true;
  return permissionService.hasAnyPermission(roles, item.permissions);
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      {
        key: 'command-centre',
        label: 'Command Centre',
        href: '/needs-attention',
        icon: AlertOctagon,
        // Same gate as the needsAttention widget (WidgetRegistry.ts) and
        // the GET /api/ai/needs-attention route itself.
        permissions: [Permission.ANALYTICS_VIEW],
      },
      {
        key: 'driver',
        label: 'Driver',
        href: '/driver',
        icon: ClipboardCheck,
        // Gated on DVIR_CREATE (not just DVIR_VIEW) so this entry only
        // shows for roles that actually submit inspections -- drivers --
        // rather than every role that can browse them (workshop/fleet
        // managers already reach DVIR data via Work Orders/Needs Attention).
        permissions: [Permission.DVIR_CREATE],
      },
    ],
  },
  {
    title: 'Fleet',
    items: [
      { key: 'vehicles', label: 'Vehicles', href: '/vehicles', icon: Truck, permissions: [Permission.VEHICLE_VIEW] },
      {
        key: 'live-map',
        label: 'Live Map',
        href: '/telematics/map',
        icon: MapPin,
        permissions: [Permission.VEHICLE_VIEW],
        children: [
          // The Eagle Track tracker mapping worklist. Gated on
          // VEHICLE_VIEW to MATCH ITS GET ROUTE, not on VEHICLE_EDIT:
          // the page is readable by anyone who can see the fleet, and
          // the link/unlink controls are what require edit. Gating the
          // nav entry on the write permission would hide a page a viewer
          // is entitled to open -- the same nav/API mismatch the drivers
          // entry above was added to fix.
          {
            key: 'tracker-mapping',
            label: 'Tracker Mapping',
            href: '/telematics/trackers',
            permissions: [Permission.VEHICLE_VIEW],
          },
        ],
      },
      // FIX: /drivers existed as a backend module and two API routes but
      // had no page and no nav entry, so drivers were unreachable in the UI.
      //
      // 'Scorecard' child added for the AI driver-risk scorecard
      // (frontend/modules/ai). Gated on ANALYTICS_VIEW rather than
      // VEHICLE_VIEW like the parent -- it's the permission
      // GET /api/ai/driver-risk actually enforces (see
      // app/api/ai/driver-risk/route.ts), which is a different gate
      // than the drivers roster itself.
      {
        key: 'drivers',
        label: 'Drivers',
        href: '/drivers',
        icon: Users,
        permissions: [Permission.VEHICLE_VIEW],
        children: [
          { key: 'drivers-scorecard', label: 'Scorecard', href: '/drivers/scorecard', permissions: [Permission.ANALYTICS_VIEW] },
        ],
      },
      {
        key: 'trips',
        label: 'Trips',
        href: '/trips',
        icon: Route,
        permissions: [Permission.TRIP_VIEW, Permission.DRIVER_VIEW_TRIPS, Permission.TRIP_CREATE],
        children: [
          { key: 'trips-analytics', label: 'Trip Analytics', href: '/trips/analytics', permissions: [Permission.TRIP_VIEW] },
        ],
      },
      {
        key: 'fuel',
        label: 'Fuel',
        href: '/fuel',
        icon: FuelIcon,
        permissions: [Permission.FUEL_VIEW, Permission.FUEL_CREATE],
        children: [
          { key: 'fuel-logs', label: 'Fuel Logs', href: '/fuel/logs', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-stations', label: 'Stations', href: '/fuel/stations', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-cards', label: 'Fuel Cards', href: '/fuel/cards', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-analytics', label: 'Fuel Analytics', href: '/fuel/analytics', permissions: [Permission.FUEL_VIEW] },
        ],
      },
      {
        key: 'expenses',
        label: 'Expenses',
        href: '/expenses',
        icon: Wallet,
        permissions: [Permission.EXPENSE_VIEW],
        children: [
          { key: 'expenses-list', label: 'All Expenses', href: '/expenses/list', permissions: [Permission.EXPENSE_VIEW] },
          { key: 'expenses-analytics', label: 'Expense Analytics', href: '/expenses/analytics', permissions: [Permission.EXPENSE_VIEW] },
        ],
      },
      {
        key: 'maintenance',
        label: 'Maintenance',
        href: '/maintenance',
        icon: Wrench,
        permissions: [Permission.MAINTENANCE_VIEW],
        children: [
          { key: 'maintenance-list', label: 'All Records', href: '/maintenance/list', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-upcoming', label: 'Upcoming', href: '/maintenance/upcoming', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-overdue', label: 'Overdue', href: '/maintenance/overdue', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-calendar', label: 'Calendar', href: '/maintenance/calendar', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-analytics', label: 'Analytics', href: '/maintenance/analytics', permissions: [Permission.MAINTENANCE_VIEW] },
        ],
      },
      // Work order detail/assign page shipped -- see app/(protected)/workorders/**.
      // This is the destination for the DVIR defect links surfaced on the
      // Command Centre and dashboard Needs Attention widget.
      {
        key: 'workorders',
        label: 'Work Orders',
        href: '/workorders',
        icon: ClipboardList,
        permissions: [Permission.WORKORDER_VIEW],
      },
    ],
  },
  /**
   * FIX (dead navigation): the 'Operations' section linked to /dispatch,
   * /workshop, /inventory, /procurement, /vendors, /compliance and /sla.
   * NONE of those pages exist -- every one was a guaranteed 404 for any
   * user whose role granted the permission. Seven dead links in one
   * section is worse than an absent section: it reads as a broken product.
   *
   * The backend modules for these DO exist, so the routes are kept here in
   * one place, commented, ready to re-enable the moment each page ships.
   * Re-enable an entry only once app/(protected)/<route>/page.tsx exists.
   *
   *   { key: 'dispatch',    label: 'Dispatch',      href: '/dispatch',    icon: ClipboardList, permissions: [Permission.DISPATCH_VIEW] },
   *   { key: 'workshop',    label: 'Workshop',      href: '/workshop',    icon: Warehouse,     permissions: [Permission.WORKSHOP_VIEW] },
   *   { key: 'inventory',   label: 'Inventory',     href: '/inventory',   icon: Boxes,         permissions: [Permission.INVENTORY_VIEW] },
   *   { key: 'procurement', label: 'Procurement',   href: '/procurement', icon: ShoppingCart,  permissions: [Permission.PROCUREMENT_VIEW] },
   *   { key: 'vendors',     label: 'Vendors',       href: '/vendors',     icon: Building2,     permissions: [Permission.VENDOR_VIEW] },
   *   { key: 'compliance',  label: 'Compliance',    href: '/compliance',  icon: ShieldCheck,   permissions: [Permission.COMPLIANCE_VIEW] },
   *   { key: 'sla',         label: 'SLA Policies',  href: '/sla',         icon: Timer,         permissions: [Permission.SLA_VIEW] },
   */
  {
    title: 'Insights',
    items: [
      // Fleet Leaderboard (frontend/modules/leaderboard): ranked driver
      // and vehicle boards plus the alert-category tiles.
      //
      // Gated on ANY of ANALYTICS_VIEW / MAINTENANCE_VIEW because the
      // page reads two independently-gated groups of endpoints
      // (GET /api/ai/dashboard needs the former, the /api/reminders
      // analytics actions the latter) and degrades in halves rather
      // than all-or-nothing -- see FleetLeaderboardPage. Gating the nav
      // entry on both would hide a page that a maintenance-only role is
      // entitled to open and would find useful, which is the same
      // nav/API mismatch the Tracker Mapping child above documents.
      {
        key: 'fleet-leaderboard',
        label: 'Fleet Leaderboard',
        href: '/leaderboard',
        icon: Trophy,
        permissions: [Permission.ANALYTICS_VIEW, Permission.MAINTENANCE_VIEW],
      },
      {
        key: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        permissions: [Permission.REPORT_VIEW],
        children: [
          { key: 'reports-builder', label: 'Report Builder', href: '/reports/builder', permissions: [Permission.REPORT_CREATE] },
          { key: 'reports-scheduled', label: 'Scheduled', href: '/reports/scheduled', permissions: [Permission.REPORT_VIEW] },
          { key: 'reports-exports', label: 'Exports', href: '/reports/exports', permissions: [Permission.REPORT_VIEW] },
          {
            key: 'reports-gl-reconciliation',
            label: 'GL Reconciliation',
            href: '/reports/gl-reconciliation',
            permissions: [Permission.FINANCE_VIEW],
          },
        ],
      },
      {
        key: 'workflows',
        label: 'Workflows',
        href: '/workflows',
        icon: GitBranch,
        permissions: [Permission.WORKFLOW_VIEW],
        children: [
          { key: 'workflows-instances', label: 'Instances', href: '/workflows/instances', permissions: [Permission.WORKFLOW_VIEW] },
          { key: 'workflows-my-tasks', label: 'My Tasks', href: '/workflows/my-tasks', permissions: [Permission.WORKFLOW_VIEW] },
        ],
      },
      {
        key: 'analytics',
        label: 'Organization Analytics',
        href: '/organizations/analytics',
        icon: LineChart,
        permissions: [Permission.ORG_MANAGE],
      },
    ],
  },
  {
    title: 'Organization',
    items: [
      { key: 'org-dashboard', label: 'Overview', href: '/organizations/dashboard', icon: Building2, permissions: [Permission.ORG_VIEW] },
      {
        key: 'members',
        label: 'Members',
        href: '/organizations/members',
        icon: Users,
        permissions: [Permission.ORG_MEMBERS_MANAGE],
      },
      {
        key: 'roles',
        label: 'Roles & Permissions',
        href: '/organizations/roles',
        icon: Shield,
        permissions: [Permission.ORG_MANAGE],
      },
      {
        key: 'teams',
        label: 'Teams & Branches',
        href: '/organizations/teams',
        icon: Warehouse,
        permissions: [Permission.ORG_UNIT_MANAGE],
      },
    ],
  },
  {
    title: 'Security',
    items: [
      // FIX (dead link): /auth/sessions had a nav entry but no page --
      // a guaranteed 404 shown to every authenticated user. The session
      // management API exists; re-enable once the page ships:
      //   { key: 'sessions', label: 'My Sessions', href: '/auth/sessions', icon: Monitor },
      {
        key: 'api-keys',
        label: 'API Keys',
        href: '/organizations/advanced?tab=plugins',
        icon: KeyRound,
        permissions: [Permission.API_KEY_MANAGE],
      },
      {
        key: 'org-audit',
        label: 'Audit Log',
        href: '/organizations/audit-log',
        icon: ScrollText,
        permissions: [Permission.AUDIT_LOG_VIEW],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        key: 'org-settings',
        label: 'Organization Settings',
        href: '/organizations/settings',
        icon: Settings,
        permissions: [Permission.ORG_SETTINGS],
      },
      {
        key: 'org-advanced',
        label: 'Advanced',
        href: '/organizations/advanced',
        icon: Settings,
        permissions: [Permission.ORG_MANAGE],
      },
    ],
  },
  {
    // Platform-only, cross-tenant views. Gated on Permission.PLATFORM_VIEW,
    // which PLATFORM_ONLY_PERMISSIONS (server/permissions/roles.ts) strips
    // from every tenant-level role -- so this section is invisible to any
    // organization owner/admin no matter how many roles they hold, matching
    // the gate on the API route itself.
    title: 'Platform',
    items: [
      {
        key: 'provider-health',
        label: 'Provider Health',
        href: '/observability/telematics/providers',
        icon: Activity,
        permissions: [Permission.PLATFORM_VIEW],
      },
      /**
       * Platform Admin (frontend/modules/platform-admin).
       *
       * FIX (dead page, the inverse of a dead link):
       * app/(protected)/platform-admin/organizations/** has shipped
       * since the first Platform Admin slice but had NO nav entry, so
       * the only way to reach it was to type the URL. Added here
       * alongside the new Users / Roles / API keys / Audit log pages
       * rather than left unreachable.
       *
       * Every entry is gated on Permission.PLATFORM_VIEW, which
       * PLATFORM_ONLY_PERMISSIONS strips from every tenant-level role
       * -- so the whole group is invisible to an organization owner or
       * admin no matter how many roles they hold, matching the gate on
       * the platform routes themselves. The children carry the SAME
       * gate rather than their endpoint's own (CUSTOM_ROLE_VIEW,
       * API_KEY_VIEW, AUDIT_LOG_VIEW): those permissions are held by
       * ordinary tenant roles too, and gating a child on one of them
       * would surface a /platform-admin link to a non-platform user
       * whose page then refuses them. Each page checks its endpoint's
       * real permission itself and says which one is missing.
       */
      {
        key: 'platform-admin',
        label: 'Platform Admin',
        href: '/platform-admin/organizations',
        icon: Building2,
        permissions: [Permission.PLATFORM_VIEW],
        children: [
          {
            key: 'platform-admin-users',
            label: 'Users',
            href: '/platform-admin/users',
            permissions: [Permission.PLATFORM_VIEW],
          },
          {
            key: 'platform-admin-roles',
            label: 'Roles & Permissions',
            href: '/platform-admin/roles',
            permissions: [Permission.PLATFORM_VIEW],
          },
          {
            key: 'platform-admin-api-keys',
            label: 'API Keys',
            href: '/platform-admin/api-keys',
            permissions: [Permission.PLATFORM_VIEW],
          },
          {
            key: 'platform-admin-audit-log',
            label: 'Audit Log',
            href: '/platform-admin/audit-log',
            permissions: [Permission.PLATFORM_VIEW],
          },
        ],
      },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarNavContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNavContent({ collapsed = false, onNavigate }: SidebarNavContentProps) {
  const pathname = usePathname() ?? '';
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];

  return (
    <div className="flex flex-col h-full py-3 overflow-y-auto">
      <div className="flex items-center gap-2 px-3 pb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-primary text-primary-foreground">
          <Truck className="w-4 h-4" aria-hidden="true" />
        </div>
        {!collapsed && (
          <span className="font-semibold truncate text-h3 text-sidebar-foreground">Fleet Platform</span>
        )}
      </div>

      <nav className="flex-1 px-2 space-y-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => isItemVisible(item, roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  // Children are revealed for the active section only, so the
                  // sidebar stays scannable instead of listing every sub-page
                  // at all times.
                  const visibleChildren = (item.children ?? []).filter((child) =>
                    isItemVisible({ ...child, icon: item.icon }, roles)
                  );
                  const showChildren = !collapsed && active && visibleChildren.length > 0;

                  return (
                    <div key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          collapsed && 'justify-center px-0',
                          active
                            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>

                      {showChildren && (
                        <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                          {visibleChildren.map((child) => {
                            const childActive = isActivePath(pathname, child.href);
                            return (
                              <Link
                                key={child.key}
                                href={child.href}
                                onClick={onNavigate}
                                aria-current={childActive ? 'page' : undefined}
                                className={cn(
                                  'block rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors',
                                  childActive
                                    ? 'bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground'
                                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
                                )}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!collapsed && (
          <div className="pt-2 border-t border-sidebar-border">
            <OrganizationAdvancedNavLinks />
          </div>
        )}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-150 lg:flex lg:flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex-1 overflow-hidden">
        <SidebarNavContent collapsed={collapsed} />
      </div>
      <div className="p-2 border-t border-sidebar-border">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-full gap-2 py-2 transition-colors rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-caption">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}