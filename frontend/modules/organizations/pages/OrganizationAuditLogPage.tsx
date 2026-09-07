// frontend/modules/organizations/pages/OrganizationAuditLogPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { AuditLogTable } from '../components/audit/AuditLogTable';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

export function OrganizationAuditLogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading audit log" />;
  }

  if (!canManageMembers(currentUserRole ?? 'viewer')) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Only organization owners and fleet managers can view the audit log."
        action={{ label: 'Back to dashboard', onClick: () => router.push(ORGANIZATION_ROUTES.dashboard) }}
      />
    );
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="Audit log"
        description={`A tamper-evident record of every privileged action taken on ${organization.name}.`}
      />

      <AuditLogTable organizationId={organization._id!} />
    </div>
  );
}