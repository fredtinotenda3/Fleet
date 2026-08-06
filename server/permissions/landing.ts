// server/permissions/landing.ts
//
// Where a user goes after login, and what `/` resolves to.
//
// ---------------------------------------------------------------------
// The problem this solves
// ---------------------------------------------------------------------
// Every login path in the app hard-coded `router.push('/dashboard')`
// (LoginPage.tsx, MfaVerifyPage.tsx), and `app/page.tsx` was a literal
// `<h1>Fleet Management</h1>` with no redirect at all -- so an
// authenticated user who navigated to the site root landed on a dead
// page with no navigation.
//
// `/dashboard` is the right destination for most roles, because the
// dashboard shell is permission-gated and reduces per role. It is the
// wrong destination for two groups:
//
//   * A DRIVER holds none of the analytics/fleet permissions the
//     dashboard widgets are gated on, so they land on an empty page and
//     conclude the product is broken. Their work is trips and shifts.
//   * A MECHANIC likewise: their work is work orders in their workshop.
//
// Resolution is by PERMISSION, not by a hardcoded role list. A role list
// here would drift out of sync with server/permissions/roles.ts the way
// middleware.ts's `/admin` check already did once (it let FLEET_MANAGER
// into /admin and locked ORGANIZATION_ADMIN out). Permissions are the
// thing that actually determines whether the destination page will
// render anything.

import { Permission, Role, permissionService } from './roles';

/** Fallback when a user holds no permission matching any candidate. */
export const DEFAULT_LANDING_PATH = '/dashboard';

/**
 * Ordered candidates. The FIRST entry whose permission the user holds
 * wins, so this list is a priority order, not a set: a mechanic who is
 * also a fleet manager should land on the richer page.
 */
const LANDING_RULES: Array<{ permission: Permission; path: string }> = [
  // ANALYTICS_VIEW is the discriminator for "this user has a
  // manager-grade view of the fleet": owners, admins, every *_MANAGER,
  // accountants and auditors hold it; drivers and mechanics do not.
  // It must come first, because the dashboard is the richest
  // destination and anyone who can use it should get it.
  { permission: Permission.ANALYTICS_VIEW, path: '/dashboard' },

  // ORDERING MATTERS BELOW THIS LINE.
  //
  // These specialised destinations must be evaluated BEFORE the generic
  // VEHICLE_VIEW fallback, because DRIVER and MECHANIC both hold
  // VEHICLE_VIEW. Putting the generic rule earlier (as the first draft
  // of this file did) swallows both roles into /dashboard -- which is
  // precisely the empty-page bug this resolver exists to prevent, and
  // it fails silently because /dashboard renders fine, just with every
  // widget gated off.
  { permission: Permission.MECHANIC_VIEW_MAINTENANCE, path: '/maintenance' },
  { permission: Permission.WORKORDER_VIEW, path: '/maintenance' },
  { permission: Permission.DRIVER_VIEW_TRIPS, path: '/trips' },

  // Generic fallbacks, last.
  { permission: Permission.VEHICLE_VIEW, path: '/dashboard' },
  { permission: Permission.TRIP_VIEW, path: '/trips' },
];

/**
 * The path this user should land on.
 *
 * Deliberately never returns a path the caller cannot reach: every
 * candidate is gated on a permission the destination page itself
 * requires, so this cannot bounce a user into a redirect loop with
 * middleware.ts.
 */
export function resolveLandingPath(roles: string[]): string {
  if (!roles || roles.length === 0) return DEFAULT_LANDING_PATH;

  // A platform admin has every permission, so the first rule would match
  // regardless -- but being explicit documents the intent and survives
  // reordering of LANDING_RULES.
  if (roles.includes(Role.SUPER_ADMIN)) return '/admin';

  for (const rule of LANDING_RULES) {
    if (permissionService.hasPermission(roles, rule.permission)) {
      return rule.path;
    }
  }

  return DEFAULT_LANDING_PATH;
}

/**
 * True when `path` is a safe internal redirect target.
 *
 * Guards the `callbackUrl` query parameter that middleware.ts sets on a
 * bounce to /auth/login. Without this check, `?callbackUrl=https://evil`
 * turns the login page into an open redirect -- a phishing primitive
 * that is easy to miss because the parameter looks internal.
 */
export function isSafeRedirectPath(path: string | null | undefined): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  // Must be a site-relative path. Reject absolute URLs, protocol-
  // relative URLs (//evil.com), and anything with a scheme.
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\')) return false;
  return true;
}
