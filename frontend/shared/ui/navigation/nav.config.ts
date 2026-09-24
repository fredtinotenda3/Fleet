// frontend/shared/ui/navigation/nav.config.ts
//
// The navigation model, as data.
//
// Extracted from Sidebar.tsx during the UI/UX overhaul so that the two things
// worth testing — which items a set of roles may see, and which item a given
// pathname is "inside" — are pure functions in a file jest can import. The
// project's jest is testEnvironment:'node' with no jsdom, so nothing that
// renders can be covered; keeping the decisions out of the component is what
// makes them coverable at all. Same split the platform-admin module uses.
//
// ---------------------------------------------------------------------------
// SECURITY CONTRACT — read before editing.
// ---------------------------------------------------------------------------
// Navigation visibility is a CONVENIENCE, never an authorization boundary.
// Every route here is independently guarded by `withAuth(...)` on its API
// handlers and by RouteGuard/PermissionGuard on the page. Hiding an item does
// not protect it and showing one does not grant it.
//
// What this file MUST get right is the inverse: never show a link the user's
// page or API will then refuse. That is a real defect (it reads as a broken
// product) and it is why every entry is gated on a `Permission` resolved
// through the same `permissionService` the server uses, rather than on a
// hand-maintained list of role strings. A role-string list had already
// drifted twice in this codebase's history.
//
// Two further rules that were learned the hard way and are preserved here:
//
//   1. Gate a child on the permission ITS OWN endpoint enforces, not the
//      parent's, EXCEPT under /platform-admin — see the note on that section.
//   2. Never add an entry for a route that has no page. Seven dead links
//      (/dispatch, /workshop, /inventory, /procurement, /vendors, /compliance,
//      /sla) shipped once and every one was a guaranteed 404. The backend
//      modules for those still exist; the commented block at the bottom of
//      this file is where they wait.

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
  Building2,
  FileBarChart,
  LineChart,
  Users,
  Shield,
  KeyRound,
  ScrollText,
  Settings,
  Radar,
  MapPin,
  Activity,
  GitBranch,
  Trophy,
  Gauge,
  Scale,
  Banknote,
} from 'lucide-react';
import { Permission } from '@/server/permissions/roles';

export interface NavChildItem {
  key: string;
  label: string;
  href: string;
  /** Same semantics as the parent: visible if the user holds ANY of these. */
  permissions?: Permission[];
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Visible if the user holds ANY of these. Omit = visible to every authenticated user. */
  permissions?: Permission[];
  /** One short line explaining what the destination answers. Shown in tooltips and the mobile drawer. */
  hint?: string;
  children?: NavChildItem[];
}

export interface NavSection {
  /** Stable id, used for React keys and for the collapsed-mode dividers. */
  id: string;
  title: string;
  items: NavItem[];
}

/**
 * The information architecture.
 *
 * Grouped by the question the operator is asking, which is the order the
 * product's own vision states it: what is happening (Overview) → what is
 * running (Operations) → what needs fixing (Maintenance) → what it costs
 * (Cost & Finance) → what it means (Intelligence) → what happens
 * automatically (Automation) → who may do what (Administration).
 *
 * Deviations from the brief's suggested grouping, and why:
 *
 *   - Reports sits under INTELLIGENCE, not under "Cost & Utilization". The
 *     report builder's data sources span vehicles, trips, maintenance, fuel
 *     and expenses; filing it under cost would misdescribe it and hide it
 *     from the people who use it for utilisation and compliance reporting.
 *     GL Reconciliation stays with it as a child, gated on FINANCE_VIEW —
 *     that one genuinely is a finance surface, and it is where its page
 *     already lives (/reports/gl-reconciliation).
 *   - Driver Scorecard moved OUT of Drivers and INTO Intelligence, as the
 *     brief asks. It is deliberately not listed in both places: a duplicated
 *     nav entry makes a sidebar harder to learn, not easier.
 *   - Live Map leads OPERATIONS. "Where is my fleet right now" is the first
 *     operational question, and the map is the only screen that answers it.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        hint: 'Fleet health, cost and performance at a glance',
      },
      {
        key: 'command-centre',
        label: 'Command Centre',
        href: '/needs-attention',
        icon: Radar,
        hint: 'Everything that needs a decision, ranked',
        // Same gate as the needsAttention widget and GET /api/ai/needs-attention.
        permissions: [Permission.ANALYTICS_VIEW],
      },
      {
        key: 'driver',
        label: 'My Inspections',
        href: '/driver',
        icon: ClipboardCheck,
        hint: 'Submit and review your vehicle inspections',
        // DVIR_CREATE, not DVIR_VIEW: this is the driver's own workspace.
        // Workshop and fleet managers reach the same records through Work
        // Orders and the Command Centre, so gating on the read permission
        // would put a personal surface in every manager's sidebar.
        permissions: [Permission.DVIR_CREATE],
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      {
        key: 'live-map',
        label: 'Live Map',
        href: '/telematics/map',
        icon: MapPin,
        hint: 'Where every vehicle is, and how fresh that is',
        permissions: [Permission.VEHICLE_VIEW],
        children: [
          // VEHICLE_VIEW to MATCH ITS GET ROUTE, not VEHICLE_EDIT: the page
          // is readable by anyone who can see the fleet, and only the
          // link/unlink controls require edit. Gating the nav entry on the
          // write permission would hide a page a viewer may open.
          {
            key: 'tracker-mapping',
            label: 'Tracker Mapping',
            href: '/telematics/trackers',
            permissions: [Permission.VEHICLE_VIEW],
          },
        ],
      },
      {
        key: 'vehicles',
        label: 'Vehicles',
        href: '/vehicles',
        icon: Truck,
        hint: 'The fleet register, status and assignments',
        permissions: [Permission.VEHICLE_VIEW],
      },
      {
        key: 'drivers',
        label: 'Drivers',
        href: '/drivers',
        icon: Users,
        hint: 'Who drives what, and how they are performing',
        // NOTE: no Permission.DRIVER_* exists in the permission model. The
        // drivers API is gated on VEHICLE_* as a documented backend stopgap,
        // and this entry mirrors that exactly. If DRIVER_VIEW is ever added,
        // change both together.
        permissions: [Permission.VEHICLE_VIEW],
      },
      {
        key: 'trips',
        label: 'Trips',
        href: '/trips',
        icon: Route,
        hint: 'Journeys, distance and utilisation',
        permissions: [Permission.TRIP_VIEW, Permission.DRIVER_VIEW_TRIPS, Permission.TRIP_CREATE],
        children: [
          { key: 'trips-analytics', label: 'Trip Analytics', href: '/trips/analytics', permissions: [Permission.TRIP_VIEW] },
        ],
      },
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    items: [
      {
        key: 'maintenance',
        label: 'Maintenance',
        href: '/maintenance',
        icon: Wrench,
        hint: 'Service due, overdue and history',
        permissions: [Permission.MAINTENANCE_VIEW],
        children: [
          { key: 'maintenance-upcoming', label: 'Upcoming', href: '/maintenance/upcoming', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-overdue', label: 'Overdue', href: '/maintenance/overdue', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-calendar', label: 'Calendar', href: '/maintenance/calendar', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-list', label: 'All Records', href: '/maintenance/list', permissions: [Permission.MAINTENANCE_VIEW] },
          { key: 'maintenance-analytics', label: 'Analytics', href: '/maintenance/analytics', permissions: [Permission.MAINTENANCE_VIEW] },
        ],
      },
      {
        key: 'workorders',
        label: 'Work Orders',
        href: '/workorders',
        icon: ClipboardList,
        hint: 'Jobs raised, assigned and completed',
        permissions: [Permission.WORKORDER_VIEW],
      },
    ],
  },
  {
    id: 'cost',
    title: 'Cost & Finance',
    items: [
      {
        key: 'fuel',
        label: 'Fuel',
        href: '/fuel',
        icon: FuelIcon,
        hint: 'Consumption, spend and abnormal usage',
        permissions: [Permission.FUEL_VIEW, Permission.FUEL_CREATE],
        children: [
          { key: 'fuel-logs', label: 'Fuel Logs', href: '/fuel/logs', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-analytics', label: 'Fuel Analytics', href: '/fuel/analytics', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-stations', label: 'Stations', href: '/fuel/stations', permissions: [Permission.FUEL_VIEW] },
          { key: 'fuel-cards', label: 'Fuel Cards', href: '/fuel/cards', permissions: [Permission.FUEL_VIEW] },
        ],
      },
      {
        key: 'expenses',
        label: 'Expenses',
        href: '/expenses',
        icon: Wallet,
        hint: 'What the fleet is costing, by category',
        permissions: [Permission.EXPENSE_VIEW],
        children: [
          { key: 'expenses-list', label: 'All Expenses', href: '/expenses/list', permissions: [Permission.EXPENSE_VIEW] },
          { key: 'expenses-analytics', label: 'Expense Analytics', href: '/expenses/analytics', permissions: [Permission.EXPENSE_VIEW] },
        ],
      },
      {
        key: 'transport-cost',
        label: 'Transport Cost',
        href: '/transport-cost/report',
        icon: Banknote,
        hint: 'Third-party transporter spend: the Command Centre, the O4 vehicle report, and the source-file import pipeline',
        // TRANSPORT_COST_VIEW to match the O4 report route's own gate. The
        // import child below carries its own, stricter permission per rule 1.
        permissions: [Permission.TRANSPORT_COST_VIEW],
        children: [
          {
            // ADDED, OLIVINE LIVE OPERATING MODEL, SLICE 4. The Command
            // Centre -- filters/KPI cards/charts/trust panel across every
            // cost-facing company, category, vehicle, transporter,
            // destination, and customer, not just the Stream -> Vehicle
            // drill-down the existing report screen offers. Same
            // TRANSPORT_COST_VIEW gate; listed first as the primary
            // landing view for this section.
            key: 'transport-cost-command-centre',
            label: 'Command Centre',
            href: '/transport-cost/command-centre',
            permissions: [Permission.TRANSPORT_COST_VIEW],
          },
          {
            key: 'transport-cost-import',
            label: 'Import Data',
            href: '/transport-cost/import',
            permissions: [Permission.TRANSPORT_COST_IMPORT],
          },
        ],
      },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    items: [
      {
        key: 'driver-scorecard',
        label: 'Driver Scorecard',
        href: '/drivers/scorecard',
        icon: Gauge,
        hint: 'Driver risk and behaviour scoring',
        // ANALYTICS_VIEW is what GET /api/ai/driver-risk actually enforces —
        // a different gate from the drivers roster itself.
        permissions: [Permission.ANALYTICS_VIEW],
      },
      {
        key: 'leaderboard',
        label: 'Leaderboard',
        href: '/leaderboard',
        icon: Trophy,
        hint: 'Ranked drivers and vehicles',
        // ANY of the two: the page reads two independently-gated groups of
        // endpoints and degrades in halves rather than all-or-nothing.
        // Requiring both would hide a page a maintenance-only role may open.
        permissions: [Permission.ANALYTICS_VIEW, Permission.MAINTENANCE_VIEW],
      },
      {
        key: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        hint: 'Build, schedule and export fleet reporting',
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
        key: 'org-analytics',
        label: 'Organization Analytics',
        href: '/organizations/analytics',
        icon: LineChart,
        hint: 'Cross-branch performance',
        permissions: [Permission.ORG_MANAGE],
      },
    ],
  },
  {
    id: 'automation',
    title: 'Automation',
    items: [
      {
        key: 'workflows',
        label: 'Workflows',
        href: '/workflows',
        icon: GitBranch,
        hint: 'Approvals and automated processes',
        permissions: [Permission.WORKFLOW_VIEW],
        children: [
          { key: 'workflows-my-tasks', label: 'My Tasks', href: '/workflows/my-tasks', permissions: [Permission.WORKFLOW_VIEW] },
          { key: 'workflows-instances', label: 'Instances', href: '/workflows/instances', permissions: [Permission.WORKFLOW_VIEW] },
        ],
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    items: [
      {
        key: 'org-dashboard',
        label: 'Organization',
        href: '/organizations/dashboard',
        icon: Building2,
        hint: 'Organization overview',
        permissions: [Permission.ORG_VIEW],
      },
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
        // ORG_MANAGE rather than CUSTOM_ROLE_VIEW: FLEET_MANAGER already
        // holds CUSTOM_ROLE_VIEW, and gating on it would hand a fleet
        // manager the organization's role administration.
        permissions: [Permission.ORG_MANAGE],
      },
      {
        key: 'teams',
        label: 'Teams & Branches',
        href: '/organizations/teams',
        icon: Warehouse,
        permissions: [Permission.ORG_UNIT_MANAGE],
      },
      {
        key: 'org-settings',
        label: 'Settings',
        href: '/organizations/settings',
        icon: Settings,
        permissions: [Permission.ORG_SETTINGS],
      },
      {
        key: 'api-keys',
        label: 'API Keys',
        // Was '/organizations/advanced?tab=plugins': a page that ignored
        // the tab parameter AND contains no API-key UI on any tab. The
        // real UI now has a tenant-reachable route.
        href: '/organizations/api-keys',
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
    id: 'platform',
    title: 'Platform',
    items: [
      {
        key: 'platform-admin',
        label: 'Platform Admin',
        href: '/platform-admin/organizations',
        icon: Scale,
        hint: 'Cross-tenant administration',
        // PLATFORM_VIEW is stripped from every tenant-level role by
        // PLATFORM_ONLY_PERMISSIONS, so this whole section is invisible to
        // an organization owner or admin no matter how many roles they hold.
        permissions: [Permission.PLATFORM_VIEW],
        children: [
          // These children carry PLATFORM_VIEW rather than their endpoint's
          // own permission (CUSTOM_ROLE_VIEW / API_KEY_VIEW /
          // AUDIT_LOG_VIEW) — the one deliberate exception to rule 1 at the
          // top of this file. Those three permissions ARE held by ordinary
          // tenant roles, so gating on them would surface a /platform-admin
          // link to a non-platform user whose page then refuses them. Each
          // page checks its endpoint's real permission itself.
          { key: 'platform-admin-users', label: 'Users', href: '/platform-admin/users', permissions: [Permission.PLATFORM_VIEW] },
          { key: 'platform-admin-roles', label: 'Roles & Permissions', href: '/platform-admin/roles', permissions: [Permission.PLATFORM_VIEW] },
          { key: 'platform-admin-api-keys', label: 'API Keys', href: '/platform-admin/api-keys', permissions: [Permission.PLATFORM_VIEW] },
          { key: 'platform-admin-audit-log', label: 'Audit Log', href: '/platform-admin/audit-log', permissions: [Permission.PLATFORM_VIEW] },
        ],
      },
      {
        key: 'provider-health',
        label: 'Provider Health',
        href: '/observability/telematics/providers',
        icon: Activity,
        hint: 'Telematics provider status',
        permissions: [Permission.PLATFORM_VIEW],
      },
    ],
  },
];

/*
 * ROUTES WITH A BACKEND MODULE BUT NO PAGE. Re-enable an entry here only
 * once app/(protected)/<route>/page.tsx exists.
 *
 *   { key: 'dispatch',    label: 'Dispatch',     href: '/dispatch',    icon: ClipboardList, permissions: [Permission.DISPATCH_VIEW] },
 *   { key: 'workshop',    label: 'Workshop',     href: '/workshop',    icon: Warehouse,     permissions: [Permission.WORKSHOP_VIEW] },
 *   { key: 'inventory',   label: 'Inventory',    href: '/inventory',   icon: Boxes,         permissions: [Permission.INVENTORY_VIEW] },
 *   { key: 'procurement', label: 'Procurement',  href: '/procurement', icon: ShoppingCart,  permissions: [Permission.PROCUREMENT_VIEW] },
 *   { key: 'vendors',     label: 'Vendors',      href: '/vendors',     icon: Building2,     permissions: [Permission.VENDOR_VIEW] },
 *   { key: 'compliance',  label: 'Compliance',   href: '/compliance',  icon: ShieldCheck,   permissions: [Permission.COMPLIANCE_VIEW] },
 *   { key: 'sla',         label: 'SLA Policies', href: '/sla',         icon: Timer,         permissions: [Permission.SLA_VIEW] },
 *   { key: 'sessions',    label: 'My Sessions',  href: '/auth/sessions', icon: Monitor },
 */

// ─── Pure helpers (unit-tested in tests/unit/navigation) ─────────────────────

/**
 * Strips a query string / hash before comparing, so an entry whose href
 * carries a tab parameter (`/organizations/advanced?tab=plugins`) still
 * matches its own page.
 */
export function normalizeHref(href: string): string {
  const queryIndex = href.search(/[?#]/);
  return queryIndex === -1 ? href : href.slice(0, queryIndex);
}

/**
 * Is `pathname` at, or inside, `href`?
 *
 * `/dashboard` is matched exactly. Every other route matches its own
 * subtree, so `/vehicles/abc123` keeps "Vehicles" highlighted. Without the
 * `/` in the prefix test, `/fuel` would also claim `/fuel-cards`.
 */
export function isActivePath(pathname: string, href: string): boolean {
  const target = normalizeHref(href);
  if (target === '/dashboard') return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** True when this item, or any of its children, owns the current route. */
export function isItemActive(pathname: string, item: NavItem): boolean {
  if (isActivePath(pathname, item.href)) return true;
  return (item.children ?? []).some((child) => isActivePath(pathname, child.href));
}

type HasAnyPermission = (roles: string[], permissions: Permission[]) => boolean;

/** An item with no `permissions` is visible to every authenticated user. */
export function isVisible(
  entry: { permissions?: Permission[] },
  roles: string[],
  hasAnyPermission: HasAnyPermission
): boolean {
  if (!entry.permissions || entry.permissions.length === 0) return true;
  return hasAnyPermission(roles, entry.permissions);
}

/**
 * The whole navigation, reduced to what these roles may see.
 *
 * A section whose items are all hidden is dropped entirely, so a driver does
 * not get an empty "Administration" heading. A parent that survives keeps
 * only the children the same rules allow — the parent being visible never
 * implies its children are.
 */
export function visibleSections(
  roles: string[],
  hasAnyPermission: HasAnyPermission,
  sections: NavSection[] = NAV_SECTIONS
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => isVisible(item, roles, hasAnyPermission))
        .map((item) => ({
          ...item,
          children: (item.children ?? []).filter((child) => isVisible(child, roles, hasAnyPermission)),
        })),
    }))
    .filter((section) => section.items.length > 0);
}

/** Every href the navigation can render for these roles. Used by the nav tests. */
export function visibleHrefs(roles: string[], hasAnyPermission: HasAnyPermission): string[] {
  return visibleSections(roles, hasAnyPermission).flatMap((section) =>
    section.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)])
  );
}
