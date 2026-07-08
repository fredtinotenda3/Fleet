// frontend/modules/organizations/components/members/MemberRowActions.tsx
'use client';

import { useState } from 'react';
import { MoreHorizontal, Pencil, UserX, UserCheck, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  useRemoveMember,
  useSuspendMember,
  useRestoreMember,
} from '../../hooks/useOrganizationMutations';
import { isOwner } from '../../utils';
import type { OrganizationMember } from '../../types';

interface MemberRowActionsProps {
  organizationId: string;
  member: OrganizationMember;
  onEditRole: (member: OrganizationMember) => void;
}

export function MemberRowActions({ organizationId, member, onEditRole }: MemberRowActionsProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeMember = useRemoveMember(organizationId);
  const suspendMember = useSuspendMember(organizationId);
  const restoreMember = useRestoreMember(organizationId);

  if (isOwner(member)) {
    return <span className="text-caption text-muted-foreground">Owner</span>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Actions for ${member.name}`}>
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEditRole(member)} className="flex items-center gap-2">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Change role
          </DropdownMenuItem>

          {member.status === 'suspended' ? (
            <DropdownMenuItem
              onSelect={() => restoreMember.mutate(member.userId)}
              className="flex items-center gap-2"
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Restore access
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => suspendMember.mutate(member.userId)}
              className="flex items-center gap-2"
            >
              <UserX className="h-3.5 w-3.5" aria-hidden="true" />
              Suspend
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmRemove(true)}
            className="flex items-center gap-2 text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove from organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmRemove && (
        <div
          role="alertdialog"
          aria-label="Confirm removal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        >
          <div className="w-full max-w-sm p-5 surface-card">
            <h3 className="text-h3">Remove {member.name}?</h3>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              They&apos;ll immediately lose access to this organization. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  removeMember.mutate(member.userId);
                  setConfirmRemove(false);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}