// frontend/modules/drivers/utils/index.ts

import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * Visibility gates for the drivers UI.
 *
 * These resolve through the SAME permissionService the server uses, from
 * the same Permission enum — no hardcoded role-name lists, so a role
 * definition change cannot leave the UI and the API disagreeing.
 *
 * PERMISSION STOPGAP (inherited, documented in app/api/drivers/route.ts):
 * there is no Permission.DRIVER_VIEW / DRIVER_EDIT / DRIVER_DELETE member
 * yet, so the drivers API is gated on VEHICLE_VIEW / VEHICLE_EDIT /
 * VEHICLE_DELETE. These helpers deliberately mirror that exactly. If the
 * UI used a different permission from the route, users would either see
 * buttons that 403 or lose access they actually have. When dedicated
 * DRIVER_* permissions land, change them in BOTH places in one commit.
 *
 * IMPORTANT: this controls whether a control renders. It is NOT the
 * authorization boundary. Every drivers route is independently enforced
 * server-side via withAuth() and tenant-scoped at the repository layer.
 */

export function canViewDrivers(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.VEHICLE_VIEW]);
}

export function canManageDrivers(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.VEHICLE_EDIT]);
}

export function canDeleteDrivers(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.VEHICLE_DELETE]);
}

/**
 * Gates the vehicle <-> driver assignment controls (Vehicle Detail
 * page's "Driver" tab; see DriverAssignmentPanel).
 *
 * Unlike canManageDrivers/canDeleteDrivers above, this does NOT need the
 * VEHICLE_* stopgap -- Permission.DRIVER_ASSIGN already exists in the
 * enum and is already granted to FLEET_MANAGER, DISPATCHER, SUPERVISOR,
 * and BRANCH_MANAGER (see server/permissions/roles.ts -- note that
 * DEPARTMENT_MANAGER, despite mirroring BRANCH_MANAGER in most other
 * permission lists, does NOT hold this one). It simply had no UI control
 * wired to it before this feature.
 *
 * NOTE: the backend route this gates (PATCH /api/vehicles/:id/driver)
 * does not exist yet -- see
 * docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md. This function only
 * controls whether the button renders; it is not an authorization
 * boundary, same caveat as the helpers above.
 */
export function canAssignDriverToVehicle(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.DRIVER_ASSIGN);
}
