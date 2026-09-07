// tests/unit/navigation/nav-config.spec.ts
//
// The navigation redesign's regression guard.
//
// Navigation is not an authorization boundary — every route is independently
// guarded server-side — so these tests do NOT claim the sidebar protects
// anything. What they pin is the inverse property, which IS a real defect
// when it breaks: the sidebar must never render a link whose page or API
// will then refuse the user, and it must never render a link to a route that
// does not exist.
//
// Both failure modes have shipped in this codebase before: seven dead links
// to pages that were never built, and a hand-maintained role-string list that
// drifted from the permission table twice. These tests exist so the regroup
// performed during the UI/UX overhaul cannot silently reintroduce either.

import fs from 'fs';
import path from 'path';
import {
  NAV_SECTIONS,
  isActivePath,
  isItemActive,
  normalizeHref,
  visibleHrefs,
  visibleSections,
  type NavItem,
} from '@/frontend/shared/ui/navigation/nav.config';
import { Permission, Role, permissionService } from '@/server/permissions/roles';

const hasAny = (roles: string[], permissions: Permission[]) =>
  permissionService.hasAnyPermission(roles, permissions);

const APP_DIR = path.join(process.cwd(), 'app', '(protected)');

/** Every top-level and child entry, flattened. */
function allEntries(): Array<{ key: string; label: string; href: string; permissions?: Permission[] }> {
  return NAV_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) => [
      { key: item.key, label: item.label, href: item.href, permissions: item.permissions },
      ...(item.children ?? []),
    ])
  );
}

/**
 * Resolve a nav href to the page file Next.js would render for it.
 * Static segments only — no nav entry points at a dynamic route.
 */
function pageFileFor(href: string): string {
  const route = normalizeHref(href).replace(/^\//, '');
  return path.join(APP_DIR, route, 'page.tsx');
}

describe('nav.config — structural integrity', () => {
  it('every href resolves to a page that exists on disk', () => {
    // This is the test that would have caught the seven dead links
    // (/dispatch, /workshop, /inventory, /procurement, /vendors,
    // /compliance, /sla) at PR time instead of in production 404s.
    const missing = allEntries()
      .filter((entry) => !fs.existsSync(pageFileFor(entry.href)))
      .map((entry) => `${entry.key} -> ${entry.href}`);

    expect(missing).toEqual([]);
  });

  it('uses unique keys across the whole tree', () => {
    const keys = allEntries().map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not list the same destination twice', () => {
    // A duplicated entry makes the sidebar harder to learn and produces two
    // simultaneously-active rows. Driver Scorecard was deliberately moved
    // from a child of Drivers to a top-level Intelligence item rather than
    // being listed in both.
    const hrefs = allEntries().map((entry) => normalizeHref(entry.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('gates every entry on a real Permission enum member', () => {
    const known = new Set(Object.values(Permission));
    const unknown = allEntries().flatMap((entry) =>
      (entry.permissions ?? []).filter((permission) => !known.has(permission))
    );
    expect(unknown).toEqual([]);
  });
});

describe('nav.config — permission filtering', () => {
  it('hides a section entirely when the role may see none of its items', () => {
    // A driver holds no ORG_* permission, so "Administration" must not
    // render as an empty heading.
    const sections = visibleSections([Role.DRIVER], hasAny);
    expect(sections.map((section) => section.id)).not.toContain('administration');
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it('keeps the Platform section invisible to tenant-level administrators', () => {
    // PLATFORM_ONLY_PERMISSIONS strips PLATFORM_VIEW from every tenant
    // role, so an organization owner — the highest tenant role there is —
    // must not see cross-tenant administration.
    for (const role of [Role.ORGANIZATION_OWNER, Role.ORGANIZATION_ADMIN, Role.BRANCH_MANAGER]) {
      const ids = visibleSections([role], hasAny).map((section) => section.id);
      expect(ids).not.toContain('platform');
    }
  });

  it('shows the Platform section to a platform administrator', () => {
    const ids = visibleSections([Role.SUPER_ADMIN], hasAny).map((section) => section.id);
    expect(ids).toContain('platform');
  });

  it('filters children independently of their parent', () => {
    // FLEET_MANAGER holds REPORT_VIEW but not FINANCE_VIEW, so Reports is
    // visible while its GL Reconciliation child is not. A parent being
    // visible must never imply its children are.
    const hrefs = visibleHrefs([Role.FLEET_MANAGER], hasAny);
    expect(hrefs).toContain('/reports');
    expect(hrefs).not.toContain('/reports/gl-reconciliation');
  });

  it('shows GL Reconciliation to a role that holds FINANCE_VIEW', () => {
    // Guards against the child being unreachable for everyone, which would
    // make the assertion above pass for the wrong reason.
    expect(permissionService.hasPermission([Role.ACCOUNTANT], Permission.FINANCE_VIEW)).toBe(true);
    expect(visibleHrefs([Role.ACCOUNTANT], hasAny)).toContain('/reports/gl-reconciliation');
  });

  it('never shows a link the role lacks the permission for', () => {
    // The core property, checked exhaustively across every role in the
    // table rather than for a hand-picked few.
    for (const role of Object.values(Role)) {
      for (const section of visibleSections([role], hasAny)) {
        for (const item of section.items) {
          for (const entry of [item, ...(item.children ?? [])]) {
            if (entry.permissions?.length) {
              expect(permissionService.hasAnyPermission([role], entry.permissions)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('gives a user with no roles nothing beyond the ungated items', () => {
    // Fail-closed: an unassigned account must not be handed the fleet.
    const hrefs = visibleHrefs([], hasAny);
    expect(hrefs).toEqual(['/dashboard']);
  });
});

describe('nav.config — active-path resolution', () => {
  it('matches a route and its subtree', () => {
    expect(isActivePath('/vehicles', '/vehicles')).toBe(true);
    expect(isActivePath('/vehicles/abc123', '/vehicles')).toBe(true);
  });

  it('does not let a prefix claim a sibling route', () => {
    // Without the trailing slash in the prefix test, /fuel would highlight
    // for /fuel-cards.
    expect(isActivePath('/fuel-cards', '/fuel')).toBe(false);
    expect(isActivePath('/driversomething', '/drivers')).toBe(false);
  });

  it('matches /dashboard exactly so it does not stay lit across the app', () => {
    expect(isActivePath('/dashboard', '/dashboard')).toBe(true);
    expect(isActivePath('/dashboard/anything', '/dashboard')).toBe(false);
  });

  it('ignores a query string when matching', () => {
    // The API Keys entry points at /organizations/advanced?tab=plugins.
    expect(isActivePath('/organizations/advanced', '/organizations/advanced?tab=plugins')).toBe(true);
    expect(normalizeHref('/organizations/advanced?tab=plugins')).toBe('/organizations/advanced');
  });

  it('treats a parent as active when a child owns the route', () => {
    const trips = NAV_SECTIONS.flatMap((section) => section.items).find(
      (item): item is NavItem => item.key === 'trips'
    );
    expect(trips).toBeDefined();
    expect(isItemActive('/trips/analytics', trips!)).toBe(true);
    expect(isItemActive('/vehicles', trips!)).toBe(false);
  });
});
