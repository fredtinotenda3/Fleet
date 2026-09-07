// tests/unit/onboarding/setup-checklist.spec.ts
//
// The onboarding checklist's two safety properties, pinned.
//
// 1. A step is only shown to someone who can complete it. A checklist that
//    tells a mechanic to add a vehicle and then 403s them is worse than no
//    checklist at all.
// 2. "Not known" is never rendered as "not done". Every count the checklist
//    reads can fail or be forbidden, and a failed request must not tell an
//    administrator their fleet is empty — the same empty-vs-error distinction
//    this overhaul enforces everywhere else.

import fs from 'fs';
import path from 'path';
import {
  buildSetupChecklist,
  summariseSetup,
  EMPTY_SETUP_FACTS,
  type SetupFacts,
} from '@/frontend/modules/onboarding/utils/setup-checklist';
import { buildOrientation, describeWorkspace } from '@/frontend/modules/onboarding/utils/role-orientation';
import { Permission, Role, permissionService } from '@/server/permissions/roles';

const APP_DIR = path.join(process.cwd(), 'app', '(protected)');

const CONFIGURED: SetupFacts = {
  vehicleCount: 42,
  driverCount: 17,
  orgUnitCount: 3,
  memberCount: 9,
  telematicsConnected: true,
  hasOperatingData: true,
};

const BRAND_NEW: SetupFacts = {
  vehicleCount: 0,
  driverCount: 0,
  orgUnitCount: 0,
  memberCount: 1,
  telematicsConnected: false,
  hasOperatingData: false,
};

describe('setup checklist — permission gating', () => {
  it('gives an owner the full checklist', () => {
    const steps = buildSetupChecklist([Role.ORGANIZATION_OWNER], BRAND_NEW);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.done === false)).toBe(true);
  });

  it('gives a driver nothing to set up', () => {
    // REGRESSION: a driver holds FUEL_CREATE (logging a refuel is their
    // job), which without the anchor gate produced a one-item panel headed
    // "Finish setting up your fleet" containing "Record your first operating
    // cost" — reframing their daily work as unfinished configuration. It
    // would also have sat on "status unavailable" forever, because a driver
    // does not hold EXPENSE_VIEW and so could never read the probe.
    expect(buildSetupChecklist([Role.DRIVER], BRAND_NEW)).toEqual([]);
  });

  it('gives a viewer nothing to set up', () => {
    expect(buildSetupChecklist([Role.VIEWER], BRAND_NEW)).toEqual([]);
  });

  it('gives an accountant nothing to set up', () => {
    // Same class as the driver case: holds FUEL_CREATE and EXPENSE_VIEW but
    // no organization-configuration permission at all.
    expect(buildSetupChecklist([Role.ACCOUNTANT], BRAND_NEW)).toEqual([]);
  });

  it('gives a mechanic, dispatcher and supervisor nothing to set up', () => {
    for (const role of [Role.MECHANIC, Role.DISPATCHER, Role.SUPERVISOR]) {
      expect(buildSetupChecklist([role], BRAND_NEW)).toEqual([]);
    }
  });

  it('shows the checklist only to roles holding a configuration permission', () => {
    const anchors = [
      Permission.ORG_UNIT_MANAGE,
      Permission.VEHICLE_CREATE,
      Permission.ORG_MEMBERS_MANAGE,
      Permission.ORG_SETTINGS,
    ];
    for (const role of Object.values(Role)) {
      const shown = buildSetupChecklist([role], BRAND_NEW).length > 0;
      expect(shown).toBe(permissionService.hasAnyPermission([role], anchors));
    }
  });

  it('omits a step whose completion the user could never observe', () => {
    // FLEET_MANAGER holds VEHICLE_CREATE (an anchor) so gets a checklist,
    // and holds both FUEL_CREATE and EXPENSE_VIEW, so operating-data
    // resolves for them. The guard matters for any future step whose write
    // and read permissions diverge.
    const steps = buildSetupChecklist([Role.FLEET_MANAGER], BRAND_NEW);
    expect(steps.map((step) => step.id)).toContain('operating-data');
  });

  it('never shows a step the role cannot complete', () => {
    // The core property, checked against every role rather than a sample.
    // Each step's permission is asserted to be one the role actually holds.
    const stepPermission: Record<string, Permission> = {
      'org-units': Permission.ORG_UNIT_MANAGE,
      vehicles: Permission.VEHICLE_CREATE,
      drivers: Permission.VEHICLE_EDIT,
      telematics: Permission.ORG_SETTINGS,
      members: Permission.ORG_MEMBERS_MANAGE,
      'operating-data': Permission.FUEL_CREATE,
    };

    for (const role of Object.values(Role)) {
      for (const step of buildSetupChecklist([role], BRAND_NEW)) {
        expect(permissionService.hasPermission([role], stepPermission[step.id])).toBe(true);
      }
    }
  });

  it('gives an account with no roles nothing', () => {
    expect(buildSetupChecklist([], BRAND_NEW)).toEqual([]);
  });

  it('points every step at a page that exists', () => {
    // /fuel/logs/create and /organizations/teams are real routes; this
    // catches a step whose href drifts away from a shipped page.
    for (const step of buildSetupChecklist([Role.SUPER_ADMIN], BRAND_NEW)) {
      const route = step.href.replace(/^\//, '');
      expect(fs.existsSync(path.join(APP_DIR, route, 'page.tsx'))).toBe(true);
    }
  });
});

describe('setup checklist — unknown is not the same as incomplete', () => {
  it('marks a step indeterminate when its count could not be read', () => {
    const steps = buildSetupChecklist([Role.ORGANIZATION_OWNER], EMPTY_SETUP_FACTS);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.indeterminate)).toBe(true);
    // Critically: indeterminate steps are not reported as done either.
    expect(steps.every((step) => step.done === false)).toBe(true);
  });

  it('does not report setup complete while any step is unknown', () => {
    // A single failed request must never let the platform announce that
    // setup is finished — that is what auto-hides the panel.
    const partial: SetupFacts = { ...CONFIGURED, vehicleCount: null };
    const progress = summariseSetup(buildSetupChecklist([Role.ORGANIZATION_OWNER], partial));
    expect(progress.isComplete).toBe(false);
  });

  it('reports complete only when every step is known and done', () => {
    const progress = summariseSetup(buildSetupChecklist([Role.ORGANIZATION_OWNER], CONFIGURED));
    expect(progress.isComplete).toBe(true);
    expect(progress.nextStep).toBeNull();
  });

  it('excludes unknown steps from the progress denominator', () => {
    const partial: SetupFacts = { ...CONFIGURED, vehicleCount: null, driverCount: null };
    const progress = summariseSetup(buildSetupChecklist([Role.ORGANIZATION_OWNER], partial));
    expect(progress.known).toBe(progress.total - 2);
    expect(progress.completed).toBe(progress.known);
  });

  it('treats a real zero as incomplete, not unknown', () => {
    const steps = buildSetupChecklist([Role.ORGANIZATION_OWNER], BRAND_NEW);
    const vehicles = steps.find((step) => step.id === 'vehicles');
    expect(vehicles).toBeDefined();
    expect(vehicles!.indeterminate).toBeFalsy();
    expect(vehicles!.done).toBe(false);
    expect(vehicles!.detail).toBe('0 vehicles');
  });

  it('counts one member as "not yet invited anyone"', () => {
    // The founding account is always a member of its own organization, so a
    // count of exactly 1 means nobody else has been added.
    const owner = buildSetupChecklist([Role.ORGANIZATION_OWNER], { ...CONFIGURED, memberCount: 1 });
    expect(owner.find((step) => step.id === 'members')?.done).toBe(false);

    const invited = buildSetupChecklist([Role.ORGANIZATION_OWNER], { ...CONFIGURED, memberCount: 2 });
    expect(invited.find((step) => step.id === 'members')?.done).toBe(true);
  });

  it('orders steps so that no step depends on a later one', () => {
    // Branches before vehicles (a vehicle is assigned to a unit), vehicles
    // before drivers and telematics (a tracker maps to a vehicle).
    const ids = buildSetupChecklist([Role.SUPER_ADMIN], BRAND_NEW).map((step) => step.id);
    expect(ids.indexOf('org-units')).toBeLessThan(ids.indexOf('vehicles'));
    expect(ids.indexOf('vehicles')).toBeLessThan(ids.indexOf('drivers'));
    expect(ids.indexOf('vehicles')).toBeLessThan(ids.indexOf('telematics'));
  });

  it('names the first known-incomplete step as the next action', () => {
    const facts: SetupFacts = { ...BRAND_NEW, orgUnitCount: 2 };
    const progress = summariseSetup(buildSetupChecklist([Role.ORGANIZATION_OWNER], facts));
    expect(progress.nextStep?.id).toBe('vehicles');
  });
});

describe('role orientation', () => {
  it('offers a driver their own work, not fleet administration', () => {
    const links = buildOrientation([Role.DRIVER]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(permissionService.hasAnyPermission([Role.DRIVER], link.permissions)).toBe(true);
    }
  });

  it('never offers a link the role lacks permission for', () => {
    for (const role of Object.values(Role)) {
      for (const link of buildOrientation([role], 99)) {
        expect(permissionService.hasAnyPermission([role], link.permissions)).toBe(true);
      }
    }
  });

  it('offers nothing to an account with no roles', () => {
    expect(buildOrientation([])).toEqual([]);
  });

  it('caps the list so it does not become a second sidebar', () => {
    expect(buildOrientation([Role.SUPER_ADMIN]).length).toBeLessThanOrEqual(3);
  });

  it('tells an unscoped account plainly that it has no fleet yet', () => {
    // Fail-closed wording: an empty dashboard reads as a broken product, so
    // the reason is stated instead.
    expect(describeWorkspace([])).toMatch(/does not have a fleet assigned/i);
  });

  it('describes each role with the capability that distinguishes it', () => {
    expect(describeWorkspace([Role.SUPER_ADMIN])).toMatch(/platform-level/i);
    expect(describeWorkspace([Role.ORGANIZATION_OWNER])).toMatch(/whole organization/i);
    expect(describeWorkspace([Role.MECHANIC])).toMatch(/workshop/i);
    expect(describeWorkspace([Role.DRIVER])).toMatch(/your own driving/i);
  });
});
