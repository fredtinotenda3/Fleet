// app/(protected)/organizations/audit-log/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationAuditLogPage } from '@/frontend/modules/organizations/pages/OrganizationAuditLogPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationAuditLogPage />;
}