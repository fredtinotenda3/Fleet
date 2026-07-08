// frontend/modules/organizations/pages/OrganizationRolesPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { RoleList } from '../components/roles/RoleList';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

export function OrganizationRolesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading roles" />;
  }

  if (!canManageMembers(currentUserRole ?? 'viewer')) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Only organization owners and fleet managers can manage roles and permissions."
        action={{
          label: 'Back to dashboard',
          onClick: () => router.push(ORGANIZATION_ROUTES.dashboard),
        }}
      />
    );
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div>
        <h1 className="text-h1">Roles & permissions</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Control what each role can see and do within {organization.name}.
        </p>
      </div>

      <RoleList />
    </div>
  );
}