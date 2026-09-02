// app/(protected)/platform-admin/organizations/page.tsx
//
// Route shim for the Platform Admin organization list. Rendering and
// data fetching live in frontend/modules/platform-admin.
//
// GET /api/platform/organizations enforces Permission.PLATFORM_VIEW
// AND an in-controller check for the literal Role.SUPER_ADMIN
// (modules/tenancy/controllers/platform.controller.ts) -- reaching this
// page is not authorization. OrganizationsPage additionally checks
// PLATFORM_VIEW client-side so a user without it sees a clear message
// instead of a failed fetch.

import { OrganizationsPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <OrganizationsPage />;
}
