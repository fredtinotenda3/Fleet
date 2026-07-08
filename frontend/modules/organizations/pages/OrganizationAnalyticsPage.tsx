// frontend/modules/organizations/pages/OrganizationAnalyticsPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { OrgAnalyticsCharts } from '../components/analytics/OrgAnalyticsCharts';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

export function OrganizationAnalyticsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading organization analytics" />;
  }

  if (!canManageMembers(currentUserRole ?? 'viewer')) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Only organization owners and fleet managers can view organization analytics."
        action={{ label: 'Back to dashboard', onClick: () => router.push(ORGANIZATION_ROUTES.dashboard) }}
      />
    );
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div>
        <h1 className="text-h1">Organization analytics</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Usage, activity, and resource trends for {organization.name}.
        </p>
      </div>

      <OrgAnalyticsCharts organization={organization} />
    </div>
  );
}