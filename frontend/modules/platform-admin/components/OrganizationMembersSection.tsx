// frontend/modules/platform-admin/components/OrganizationMembersSection.tsx
'use client';

import { useState } from 'react';
import { Info, MailPlus, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';

import type { Organization, OrganizationMember } from '../types';
import {
  useCustomRoles,
  useInviteMember,
  usePlatformAccessPermissions,
  useRemoveMember,
  useRestoreMember,
  useSuspendMember,
  useUpdateMemberRole,
} from '../hooks';
import { canManageMembersFor } from '../utils/platform-access.utils';
import { formatDate } from '../utils/platform-admin.utils';
import { OrganizationMembersTable, type MemberAction } from './OrganizationMembersTable';
import { MemberRoleDialog } from './MemberRoleDialog';
import { InviteMemberDialog } from './InviteMemberDialog';

interface OrganizationMembersSectionProps {
  organization: Organization;
  /** The signed-in caller's own tenant id. Null when the session carries no tenant claim. */
  sessionTenantId: string | null;
}

/**
 * Members of one organization, read from the `members[]` embedded on
 * the Organization document.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY WRITES ARE RESTRICTED TO THE CALLER'S OWN ORGANIZATION
 * ─────────────────────────────────────────────────────────────────────
 * The five member routes take the organization from the URL and are
 * gated on `Permission.ORG_MEMBERS_MANAGE`. Nothing binds that path
 * parameter to the caller's tenant:
 *
 *   * `OrganizationService.getOrganization(organizationId, tenantId)`
 *     IGNORES its `tenantId` argument entirely -- it calls
 *     `resolveOrganization(organizationId)` and compares nothing;
 *   * `withAuth` checks permissions and roles, not resource ownership.
 *
 * So an organization admin holding ORG_MEMBERS_MANAGE in tenant A can
 * today address tenant B's organization id and the request will
 * succeed. That is a missing server-side authorization check, and
 * building a cross-tenant member-management UI on top of it would turn
 * a latent gap into a shipped feature.
 *
 * `canManageMembersFor()` therefore restricts writes to the caller's
 * own organization -- the same fail-closed shape `canManageOrgUnitsFor`
 * uses for org units, for a different underlying reason (that endpoint
 * misfires; this one is simply unguarded). Reads stay cross-tenant,
 * because `GET /api/platform/organizations/:id` genuinely is a
 * SUPER_ADMIN-gated platform read.
 *
 * The finding is written up in PLATFORM_ADMIN_BACKEND_GAPS.md.
 */
export function OrganizationMembersSection({
  organization,
  sessionTenantId,
}: OrganizationMembersSectionProps) {
  const { canManageMembers } = usePlatformAccessPermissions();

  const isOwnOrganization = canManageMembersFor(organization, sessionTenantId);
  const canManage = isOwnOrganization && canManageMembers;

  const organizationId = String(organization._id ?? '');
  const members = Array.isArray(organization.members) ? organization.members : [];
  const invites = (Array.isArray(organization.invites) ? organization.invites : []).filter(
    (invite) => invite?.status === 'pending'
  );

  const [roleDialogMember, setRoleDialogMember] = useState<OrganizationMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  // Only to decide whether to show the "custom roles can't be assigned"
  // note in the role dialog -- it is not a data dependency of the
  // table, so it stays disabled unless writes are actually available.
  const customRoles = useCustomRoles({ enabled: canManage });

  const suspendMember = useSuspendMember();
  const restoreMember = useRestoreMember();
  const removeMember = useRemoveMember();
  const updateMemberRole = useUpdateMemberRole();
  const inviteMember = useInviteMember();

  async function handleAction(action: MemberAction, member: OrganizationMember) {
    if (action === 'change-role') {
      setRoleDialogMember(member);
      return;
    }

    setPendingMemberId(member.userId);
    try {
      const variables = { organizationId, memberId: member.userId, email: member.email };
      if (action === 'suspend') await suspendMember.mutateAsync(variables);
      else if (action === 'restore') await restoreMember.mutateAsync(variables);
      else if (action === 'remove') await removeMember.mutateAsync(variables);
    } catch {
      // The mutation hooks already surface the server's own message via
      // toast -- and those messages are precise here ("Cannot suspend
      // the organization owner", "Member is already suspended").
      // Swallowed so the finally block still clears the pending row.
    } finally {
      setPendingMemberId(null);
    }
  }

  const seats = organization.subscription
    ? {
        used:
          typeof organization.subscription.usedSeats === 'number'
            ? organization.subscription.usedSeats
            : members.length,
        total:
          typeof organization.subscription.seats === 'number'
            ? organization.subscription.seats
            : members.length,
      }
    : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            Members
            <Badge variant="secondary">{members.length}</Badge>
          </CardTitle>
          {canManage && (
            <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
              <MailPlus className="size-4" aria-hidden="true" />
              Invite member
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/*
            The honest answer about what can be DONE here, shown
            whenever writes are unavailable. Two distinct reasons, and
            the operator needs to know which one applies -- "you lack a
            permission" and "this is another tenant" call for different
            next steps.
          */}
          {!isOwnOrganization ? (
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>Read-only for this organization</AlertTitle>
              <AlertDescription>
                Member changes are limited to your own organization
                {sessionTenantId ? ` (${sessionTenantId})` : ''}. The member endpoints take the
                organization from the URL but nothing ties it to the caller&apos;s tenant, so this
                console does not offer cross-tenant member writes. A platform-scoped member endpoint
                would be needed.
              </AlertDescription>
            </Alert>
          ) : !canManageMembers ? (
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>Read-only</AlertTitle>
              <AlertDescription>
                Changing members needs the organization members management permission.
              </AlertDescription>
            </Alert>
          ) : null}

          {members.length === 0 ? (
            <EmptyState
              icon={<Users className="size-8 text-muted-foreground" aria-hidden="true" />}
              title="No members"
              description="This organization has no member records."
            />
          ) : (
            <OrganizationMembersTable
              members={members}
              canManage={canManage}
              onAction={handleAction}
              pendingMemberId={pendingMemberId}
            />
          )}

          {/*
            Pending invitations are shown separately from members: there
            is no account behind them yet, and none of the member
            actions apply. The invite TOKEN is never rendered -- it is a
            credential that grants organization access to whoever holds
            it.
          */}
          {invites.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-body-sm font-medium text-foreground">
                Pending invitations ({invites.length})
              </h3>
              <ul className="divide-y divide-border rounded-md border border-border">
                {invites.map((invite) => (
                  <li
                    key={invite._id ?? invite.email}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="text-body-sm text-foreground">{invite.email}</span>
                    <span className="flex items-center gap-2 text-body-sm text-muted-foreground">
                      <Badge variant="outline">{invite.role}</Badge>
                      <span>
                        Expires {formatDate(invite.expiresAt as unknown as string)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <>
          <MemberRoleDialog
            open={Boolean(roleDialogMember)}
            member={roleDialogMember}
            onClose={() => setRoleDialogMember(null)}
            isSubmitting={updateMemberRole.isPending}
            hasCustomRoles={(customRoles.data?.length ?? 0) > 0}
            onSubmit={async (role) => {
              if (!roleDialogMember) return;
              try {
                await updateMemberRole.mutateAsync({
                  organizationId,
                  memberId: roleDialogMember.userId,
                  role,
                  email: roleDialogMember.email,
                });
              } catch {
                // Reported by the hook's toast; swallowed so the dialog
                // closes rather than leaving the operator stuck behind a
                // modal with no visible error.
              }
            }}
          />

          <InviteMemberDialog
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            isSubmitting={inviteMember.isPending}
            organizationName={organization.name}
            seats={seats}
            onSubmit={async (payload) => {
              try {
                await inviteMember.mutateAsync({ organizationId, payload });
              } catch {
                // Reported by the hook's toast. The server's messages
                // here are the useful ones (seat limit, already a
                // member), so nothing is added.
              }
            }}
          />
        </>
      )}
    </>
  );
}
