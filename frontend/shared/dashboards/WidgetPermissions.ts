
// frontend/shared/dashboards/WidgetPermissions.ts

import type { WidgetDefinition } from './WidgetRegistry';

export function canViewWidget(definition: WidgetDefinition, roles: string[]): boolean {
  if (!definition.roles || definition.roles.length === 0) return true;
  return definition.roles.some((role) => roles.includes(role));
}