// frontend/modules/platform-admin/components/OrganizationMembersTable.tsx
'use client';

import { useState } from 'react';
import { RotateCcw, ShieldOff, UserMinus, UserCog } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import type { OrganizationMember } from '../types';
import { formatDate } from '../utils/platform-admin.utils';
import {
  memberStatusLabel,
  memberStatusPresentation,
  roleLabel,
} from '../utils/platform-access.utils';

export type MemberAction = 'suspend' | 'restore' | 'remove' | 'change-role';

interface OrganizationMembersTableProps {
  members: readonly OrganizationMember[];
  /**
   * Whether member WRITES may be offered at all.
   *
   * Driven by `canManageMembersFor(org, sessionTenantId)` AND the
   * caller's ORG_MEMBERS_MANAGE permission. False renders a read-only
   * table with no action column -- see the page for the explanation it
   * shows alongside, and ../types/access.types.ts constraint 3 for why
   * this fails closed rather than trusting the route.
   */
  canManage: boolean;
  onAction: (action: MemberAction, member: OrganizationMember) => void;
  /** userId currently mid-mutation, to disable its row's controls. */
  pendingMemberId?: string | null;
}

/**
 * Members of one organization, from the `members[]` embedded on the
 * Organization document.
 *
 * THE OWNER ROW IS DELIBERATELY ACTIONLESS. `OrganizationService`
 * refuses to suspend (CANNOT_SUSPEND_OWNER), to change the role of
 * (CANNOT_MODIFY_OWNER), or to remove the organization owner --
 * ownership moves through an explicit transfer flow that has no
 * endpoint here. Rendering buttons that can only ever return a 400 is
 * worse than rendering none: it invites an operator to try, and the
 * error arrives as a toast they have to decode.
 */
export function OrganizationMembersTable({
  members,
  canManage,
  onAction,
  pendingMemberId,
}: OrganizationMembersTableProps) {
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            {canManage && (
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const presentation = memberStatusPresentation(member.status);
            const isOwner = member.role === 'organization_owner';
            const isPending = pendingMemberId === member.userId;
            const isConfirmingRemoval = confirmingRemoval === member.userId;

            return (
              <TableRow key={member.userId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {member.name || (
                        <span className="text-muted-foreground">No name recorded</span>
                      )}
                    </span>
                    <span className="text-body-sm text-muted-foreground">{member.email}</span>
                  </div>
                </TableCell>
                <TableCell className="text-body-sm">
                  <span className="flex items-center gap-1.5">
                    {roleLabel(member.role)}
                    {isOwner && <Badge variant="secondary">Owner</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={presentation.badgeVariant} className="gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                      aria-hidden="true"
                    />
                    {memberStatusLabel(member.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {formatDate(member.joinedAt ?? member.invitedAt)}
                </TableCell>

                {canManage && (
                  <TableCell className="text-right">
                    {isOwner ? (
                      <span
                        className="text-caption text-muted-foreground"
                        title="The organization owner cannot be suspended, removed, or have their role changed here."
                      >
                        Owner — no actions
                      </span>
                    ) : isConfirmingRemoval ? (
                      // Inline confirm rather than a dialog: removal is
                      // the one irreversible action here (suspend is
                      // undoable by restore), and a two-tap inline
                      // confirm keeps the member's row visible while
                      // deciding.
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-caption text-muted-foreground">Remove?</span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            setConfirmingRemoval(null);
                            onAction('remove', member);
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmingRemoval(null)}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => onAction('change-role', member)}
                        >
                          <UserCog className="size-3.5" aria-hidden="true" />
                          Role
                        </Button>

                        {member.status === 'suspended' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => onAction('restore', member)}
                          >
                            <RotateCcw className="size-3.5" aria-hidden="true" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => onAction('suspend', member)}
                          >
                            <ShieldOff className="size-3.5" aria-hidden="true" />
                            Suspend
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setConfirmingRemoval(member.userId)}
                        >
                          <UserMinus className="size-3.5" aria-hidden="true" />
                          Remove
                        </Button>
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
