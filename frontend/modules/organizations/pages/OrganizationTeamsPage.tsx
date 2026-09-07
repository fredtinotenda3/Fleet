// frontend/modules/organizations/pages/OrganizationTeamsPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { OrgUnitTree } from '../components/roles/OrgUnitTree';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

export function OrganizationTeamsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading organization structure" />;
  }

  if (!canManageMembers(currentUserRole ?? 'viewer')) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Only organization owners and fleet managers can manage the organization structure."
        action={{
          label: 'Back to dashboard',
          onClick: () => router.push(ORGANIZATION_ROUTES.dashboard),
        }}
      />
    );
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="Teams & branches"
        description={`Organize ${organization.name} into branches, departments, teams, fleets, and workshops.`}
      />

      <OrgUnitTree />
    </div>
  );
}