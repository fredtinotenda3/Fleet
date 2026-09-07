// frontend/modules/onboarding/utils/role-orientation.ts
//
// "What is this system, and what am I supposed to do with it?" — answered
// per role, on first login, from permissions the user actually holds.
//
// This is the half of onboarding that is NOT a setup checklist. A mechanic,
// a driver or a branch manager arriving at a fully-configured fleet has
// nothing to set up; what they need is to know where their work lives. The
// previous product had neither: `resolveLandingPath` drops every role on a
// page with no explanation of what it is looking at.
//
// Every entry is gated on a permission and points at a route that exists.

import { Permission, permissionService } from '@/server/permissions/roles';

export interface OrientationLink {
  key: string;
  label: string;
  /** The question this destination answers, phrased as the user would ask it. */
  question: string;
  href: string;
  permissions: Permission[];
}

/**
 * Ordered by how central each surface is to day-to-day operation. The first
 * three that a user qualifies for are what gets rendered, so the ordering is
 * the prioritisation.
 */
const ORIENTATION_LINKS: OrientationLink[] = [
  {
    key: 'command-centre',
    label: 'Command Centre',
    question: 'What needs a decision from me right now?',
    href: '/needs-attention',
    permissions: [Permission.ANALYTICS_VIEW],
  },
  {
    key: 'my-tasks',
    label: 'My Tasks',
    question: 'What approvals are waiting on me?',
    href: '/workflows/my-tasks',
    permissions: [Permission.WORKFLOW_VIEW],
  },
  {
    key: 'workorders',
    label: 'Work Orders',
    question: 'What jobs are open in the workshop?',
    href: '/workorders',
    permissions: [Permission.WORKORDER_VIEW],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    question: 'Which vehicles are due or overdue for service?',
    href: '/maintenance/upcoming',
    permissions: [Permission.MAINTENANCE_VIEW],
  },
  {
    key: 'live-map',
    label: 'Live Map',
    question: 'Where is the fleet right now?',
    href: '/telematics/map',
    permissions: [Permission.VEHICLE_VIEW],
  },
  {
    key: 'my-inspections',
    label: 'My Inspections',
    question: 'What do I need to inspect before driving?',
    href: '/driver',
    permissions: [Permission.DVIR_CREATE],
  },
  {
    key: 'trips',
    label: 'Trips',
    question: 'What journeys have been logged?',
    href: '/trips',
    permissions: [Permission.TRIP_VIEW, Permission.DRIVER_VIEW_TRIPS],
  },
  {
    key: 'fuel',
    label: 'Fuel',
    question: 'What is the fleet burning, and where is it abnormal?',
    href: '/fuel',
    permissions: [Permission.FUEL_VIEW],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    question: 'Where is the money going?',
    href: '/expenses',
    permissions: [Permission.EXPENSE_VIEW],
  },
  {
    key: 'reports',
    label: 'Reports',
    question: 'How do I get this out as a report?',
    href: '/reports',
    permissions: [Permission.REPORT_VIEW],
  },
];

/**
 * The destinations worth showing this user, most relevant first.
 *
 * Capped rather than exhaustive: an orientation panel listing eleven links is
 * a second sidebar, which helps nobody. Three is enough to answer "where do I
 * start"; the sidebar answers "where is everything".
 */
export function buildOrientation(roles: string[], limit = 3): OrientationLink[] {
  return ORIENTATION_LINKS.filter((link) =>
    permissionService.hasAnyPermission(roles, link.permissions)
  ).slice(0, limit);
}

/**
 * A one-line description of what this user's copy of the platform is for.
 *
 * Derived from permissions rather than from a role string, for the same
 * reason the navigation is: role lists drift, and a user can hold several.
 * The order of these checks is the specificity order — the most distinctive
 * capability a user holds is the one that describes them best.
 */
export function describeWorkspace(roles: string[]): string {
  const has = (permission: Permission) => permissionService.hasPermission(roles, permission);

  if (has(Permission.PLATFORM_VIEW)) {
    return 'You have platform-level access across every organization on this deployment.';
  }
  if (has(Permission.ORG_MANAGE)) {
    return 'You are seeing the whole organization: every branch, its costs, and its fleet performance.';
  }
  if (has(Permission.FINANCE_VIEW)) {
    return 'You are seeing what the fleet costs — allocations, cost per km and the general-ledger position.';
  }
  if (has(Permission.WORKORDER_VIEW) || has(Permission.MECHANIC_VIEW_MAINTENANCE)) {
    return 'You are seeing the workshop: vehicle health, service due, and the jobs assigned to you.';
  }
  if (has(Permission.DVIR_CREATE)) {
    return 'You are seeing your own driving: your vehicle, your inspections and your trips.';
  }
  if (has(Permission.VEHICLE_VIEW)) {
    return 'You are seeing the vehicles, drivers and journeys in your branch.';
  }
  // Fail-closed wording. An account with no scope assigned genuinely sees
  // nothing, and saying so plainly is better than an empty dashboard the user
  // reads as a broken product.
  return 'Your account does not have a fleet assigned yet. An administrator needs to grant you access to a branch.';
}
