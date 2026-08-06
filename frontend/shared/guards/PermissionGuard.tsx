// frontend/shared/guards/PermissionGuard.tsx

'use client';

import type { ReactNode } from 'react';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';

interface PermissionGuardProps {
  children: ReactNode;
  /** Single permission required to see the wrapped content. */
  permission?: Permission;
  /** Content is shown if the user holds ANY of these permissions. */
  anyOf?: Permission[];
  /** Content is shown only if the user holds ALL of these permissions. */
  allOf?: Permission[];
  fallback?: ReactNode;
}

/**
 * Purely a UI convenience for hiding/showing elements based on the
 * permissions derived from the current user's roles via the same
 * rolePermissions map / PermissionService used everywhere else in the
 * app (server/permissions/roles.ts). This is NOT an authorization
 * boundary -- every corresponding API route re-checks permissions
 * server-side via server/middleware/with-auth.ts and
 * PermissionEngineService, which are the actual enforcement points.
 *
 * FIX (Phase E, objective 6): this component used to accept a raw
 * `roles?: string[]` prop and compare it directly against `user.roles`
 * -- exactly the hardcoded-role-check pattern removed from
 * Sidebar.tsx / WidgetPermissions.ts. Despite its name it was never
 * actually permission-based, and any caller passing role strings here
 * could drift out of sync with rolePermissions with no compiler
 * warning. Now routed through permissionService.hasAnyPermission /
 * hasAllPermissions so that can't happen -- the Permission enum is the
 * only vocabulary this component understands.
 */
export function PermissionGuard({
  children,
  permission,
  anyOf,
  allOf,
  fallback = null,
}: PermissionGuardProps) {
  const { user } = useSessionStore();

  if (!user) return <>{fallback}</>;

  const roles = user.roles ?? [];
  const required: Permission[] = permission ? [permission] : anyOf ?? allOf ?? [];

  if (required.length === 0) return <>{children}</>;

  const allowed = allOf
    ? permissionService.hasAllPermissions(roles, allOf)
    : permissionService.hasAnyPermission(roles, required);

  return allowed ? <>{children}</> : <>{fallback}</>;
}