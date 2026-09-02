// app/(protected)/platform-admin/roles/page.tsx
//
// Route shim for Roles & Permissions. Rendering and data fetching live
// in frontend/modules/platform-admin.
//
// Three sources with three different scopes -- the static role matrix
// read from server/permissions/roles.ts, tenant-scoped custom roles
// from GET /api/security/roles, and the PermissionRegistry catalogue
// from GET /api/security/permissions. Each enforces its own gate;
// reaching this page is not authorization. See RolesPermissionsPage.

import { RolesPermissionsPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <RolesPermissionsPage />;
}
