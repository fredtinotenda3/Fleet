// app/(protected)/platform-admin/audit-log/page.tsx
//
// Route shim for the audit log. Rendering and data fetching live in
// frontend/modules/platform-admin.
//
// GET /api/security/audit-log is gated on AUDIT_LOG_VIEW and is
// cross-tenant only for a caller AuthContext considers a super admin --
// every other caller's tenant filter is overwritten with their own.
// See PlatformAuditLogPage.

import { PlatformAuditLogPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <PlatformAuditLogPage />;
}
