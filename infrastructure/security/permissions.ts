// infrastructure/security/permissions.ts
// Re-exports from server/permissions/roles.ts so existing imports to this
// path continue to resolve.

export {
  Permission,
  Role,
  rolePermissions,
  PermissionService,
  permissionService,
} from '@/server/permissions/roles';