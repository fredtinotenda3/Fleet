// frontend/modules/telematics/utils/telematics-permissions.utils.ts
//
// Visibility gates for the telematics live-map UI. These resolve
// through the SAME permissionService the server uses, from the same
// Permission enum -- no hardcoded role-name lists, so a role definition
// change cannot leave the UI and the API disagreeing.
//
// IMPORTANT: this controls whether a control renders. It is NOT the
// authorization boundary. Every telematics route is independently
// enforced server-side via withAuth() and tenant-scoped at the
// repository/service layer.

import { Permission, permissionService } from '@/server/permissions/roles';

/** Mirrors GET /api/telematics/live-map, gated on Permission.VEHICLE_VIEW. */
export function canViewLiveMap(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.VEHICLE_VIEW]);
}

/** Mirrors POST /api/telematics/demo, gated on Permission.VEHICLE_EDIT since it changes what every viewer on the tenant sees. */
export function canToggleDemoMode(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.VEHICLE_EDIT]);
}
