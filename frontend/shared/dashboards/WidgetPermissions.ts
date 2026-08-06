// frontend/shared/dashboards/WidgetPermissions.ts

import type { WidgetDefinition } from './WidgetRegistry';
import { permissionService } from '@/server/permissions/roles';

/**
 * FIX (Phase E, objective 6): was raw `roles.includes(role)` string
 * matching against `definition.roles`. Now delegates to
 * permissionService.hasAnyPermission against `definition.permission`
 * -- same engine every other authorization check in the app uses.
 */
export function canViewWidget(definition: WidgetDefinition, roles: string[]): boolean {
  if (!definition.permission || definition.permission.length === 0) return true;
  return permissionService.hasAnyPermission(roles, definition.permission);
}