// app/(protected)/platform-admin/users/page.tsx
//
// Route shim for the platform Users directory. Rendering and data
// fetching live in frontend/modules/platform-admin.
//
// The directory is DERIVED from GET /api/platform/organizations
// (PLATFORM_VIEW + a literal Role.SUPER_ADMIN check in
// PlatformController) rather than fetched: there is no platform user
// endpoint. See UsersPage and PLATFORM_ADMIN_BACKEND_GAPS.md.

import { UsersPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <UsersPage />;
}
