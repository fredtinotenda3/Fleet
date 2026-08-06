// frontend/modules/organizations/pages/OrganizationRolesPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { RoleList } from '../components/roles/RoleList';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ORGANIZATION_ROUTES } from '../routes';
import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * FIX (Phase E, task 2): was gated on canManageMembers(currentUserRole)
 * -- ORG_MEMBERS_MANAGE, the permission for the *Members* page, not
 * this one. Correct today only by coincidence (both currently resolve
 * to owner/admin only). Now gated on Permission.ORG_MANAGE, matching
 * the "Roles & Permissions" nav item's gate in Sidebar.tsx, so the nav
 * link's visibility and this page's actual access can never diverge.
 */
export function OrganizationRolesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading roles" />;
  }

  if (!permissionService.hasPermission(user?.roles ?? [], Permission.ORG_MANAGE)) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="You don't have permission to manage roles and permissions for this organization."
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