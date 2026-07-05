// modules/security/registry/bootstrap-permission-registry.ts

import { Permission } from '@/server/permissions/roles';
import { permissionRegistry, PermissionDefinition } from './PermissionRegistry';

/**
 * Dynamic permission keys that exist for composing CustomRole grants and
 * ResourcePermission ABAC-scoped grants, but are not (yet) gated by any
 * withAuth() call directly â€” they extend what a custom role or a
 * resource-level grant can express beyond the static Permission enum.
 */
const CUSTOM_PERMISSION_KEYS: string[] = [
  'vehicle:transfer',
  'vehicle:export',
  'maintenance:assign',
  'expense:reject',
  'trip:schedule',
  'trip:cancel',
  'fuel:import',
  'report:export',
  'report:configure_dashboard',
  'notification:manage',
];

function categoryFromKey(key: string): string {
  const [category] = key.split(':');
  return category || 'general';
}

function labelFromKey(key: string): string {
  const [, action] = key.split(':');
  const words = (action || key).replace(/_/g, ' ').split(' ');
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

let bootstrapped = false;

/**
 * Registers every static Permission enum member plus every dynamic
 * custom permission key. Safe to call multiple times (idempotent) since
 * several service modules call it defensively on import.
 */
export function bootstrapPermissionRegistry(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const staticDefinitions: PermissionDefinition[] = Object.values(Permission).map((key) => ({
    key,
    label: labelFromKey(key),
    category: categoryFromKey(key),
    requiresResourceScope: false,
    isCustom: false,
  }));

  const customDefinitions: PermissionDefinition[] = CUSTOM_PERMISSION_KEYS.map((key) => ({
    key,
    label: labelFromKey(key),
    category: categoryFromKey(key),
    requiresResourceScope: true,
    isCustom: true,
  }));

  permissionRegistry.registerMany([...staticDefinitions, ...customDefinitions]);
}