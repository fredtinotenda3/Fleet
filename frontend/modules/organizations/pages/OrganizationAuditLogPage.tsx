// frontend/modules/organizations/pages/OrganizationAuditLogPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { AuditLogTable } from '../components/audit/AuditLogTable';
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
      <div>
        <h1 className="text-h1">Audit log</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          A tamper-evident record of every privileged action taken on {organization.name}.
        </p>
      </div>

      <AuditLogTable organizationId={organization._id!} />
    </div>
  );
}