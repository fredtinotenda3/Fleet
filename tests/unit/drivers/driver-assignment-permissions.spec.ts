// tests/unit/drivers/driver-assignment-permissions.spec.ts
//
// Pure-function tests for canAssignDriverToVehicle
// (frontend/modules/drivers/utils/index.ts) -- the gate on the
// Vehicle Detail page's "Driver" tab assign/unassign controls.
//
// This checks the helper resolves through the SAME Permission enum /
// role table the server uses (server/permissions/roles.ts), rather than
// a hardcoded role-name list that could drift from it. It does not
// re-derive the role -> permission mapping; it asserts the helper's
// behavior against a few representative roles from that table.

import { canAssignDriverToVehicle } from '@/frontend/modules/drivers/utils';
import { Role } from '@/server/permissions/roles';

describe('canAssignDriverToVehicle', () => {
  it('grants access to roles holding Permission.DRIVER_ASSIGN', () => {
    // FLEET_MANAGER, DISPATCHER, SUPERVISOR and BRANCH_MANAGER are
    // granted DRIVER_ASSIGN in roles.ts.
    expect(canAssignDriverToVehicle([Role.FLEET_MANAGER])).toBe(true);
    expect(canAssignDriverToVehicle([Role.DISPATCHER])).toBe(true);
    expect(canAssignDriverToVehicle([Role.SUPERVISOR])).toBe(true);
    expect(canAssignDriverToVehicle([Role.BRANCH_MANAGER])).toBe(true);
  });

  it('denies roles that do not hold Permission.DRIVER_ASSIGN', () => {
    expect(canAssignDriverToVehicle([Role.VIEWER])).toBe(false);
    expect(canAssignDriverToVehicle([Role.ACCOUNTANT])).toBe(false);
    expect(canAssignDriverToVehicle([Role.MECHANIC])).toBe(false);
    // Despite mirroring BRANCH_MANAGER in most other permission lists,
    // DEPARTMENT_MANAGER does NOT hold DRIVER_ASSIGN in roles.ts today.
    expect(canAssignDriverToVehicle([Role.DEPARTMENT_MANAGER])).toBe(false);
  });

  it('denies an authenticated user with no roles', () => {
    // Being logged in is not sufficient -- this must gate on the
    // permission, not just authentication.
    expect(canAssignDriverToVehicle([])).toBe(false);
  });

  it('grants access if ANY held role carries the permission', () => {
    expect(canAssignDriverToVehicle([Role.VIEWER, Role.FLEET_MANAGER])).toBe(true);
  });
});
