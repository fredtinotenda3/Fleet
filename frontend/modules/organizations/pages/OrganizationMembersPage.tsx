/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/organizations/pages/OrganizationMembersPage.tsx
'use client';

import { UserPlus } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { InviteMemberDialog } from '../components/members/InviteMemberDialog';
import { MembersTable } from '../components/members/MembersTable';
import { PendingInvitationsList } from '../components/members/PendingInvitationsList';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

export function OrganizationMembersPage() {
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !organization) {
    return <PageLoader label="Loading members" />;
  }

  const role = currentUserRole ?? 'viewer';
  const canManage = canManageMembers(role);

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-h1">Members</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Manage who has access to {organization.name} and what they can do.
          </p>
        </div>
        {canManage && (
          <InviteMemberDialog
            organizationId={organization._id!}
            trigger={
              <Button>
                <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Invite member
              </Button>
            }
          />
        )}
      </div>

      <MembersTable
        organizationId={organization._id!}
        members={organization.members}
        canManage={canManage}
      />

      <div>
        <h2 className="mb-3 text-h3">Pending invitations</h2>
        <PendingInvitationsList
          organizationId={organization._id!}
          invites={organization.invites || []}
          canManage={canManage}
        />
      </div>
    </div>
  );
}