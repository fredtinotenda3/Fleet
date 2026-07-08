// frontend/modules/organizations/components/members/PendingInvitationsList.tsx
'use client';

import { Mail, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useRevokeInvite, useResendInvite } from '../../hooks/useOrganizationMutations';
import { getRoleLabel, inviteExpiresInDays, isInviteExpired } from '../../utils';
import type { OrganizationInvite } from '../../types';

interface PendingInvitationsListProps {
  organizationId: string;
  invites: OrganizationInvite[];
  canManage: boolean;
}

export function PendingInvitationsList({ organizationId, invites, canManage }: PendingInvitationsListProps) {
  const revokeInvite = useRevokeInvite(organizationId);
  const resendInvite = useResendInvite(organizationId);

  const pending = invites.filter((i) => i.status === 'pending');

  if (pending.length === 0) {
    return (
      <div className="p-8 surface-card">
        <EmptyState title="No pending invitations" description="Everyone you've invited has responded." />
      </div>
    );
  }

  return (
    <div className="divide-y surface-card divide-border">
      {pending.map((invite) => {
        const expired = isInviteExpired(invite.expiresAt);
        const daysLeft = inviteExpiresInDays(invite.expiresAt);

        return (
          <div key={invite.token} className="flex items-center gap-3 p-4">
            <span className="flex items-center justify-center rounded-full h-9 w-9 shrink-0 bg-muted">
              <Mail className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </span>

            <div className="flex-1 min-w-0">
              <div className="font-medium truncate text-foreground">{invite.email}</div>
              <div className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                <span>{getRoleLabel(invite.role)}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{expired ? 'Expired' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</span>
              </div>
            </div>

            {expired && <Badge variant="destructive">Expired</Badge>}

            {canManage && (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resendInvite.mutate(invite.token)}
                  aria-label={`Resend invitation to ${invite.email}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeInvite.mutate(invite.token)}
                  aria-label={`Cancel invitation to ${invite.email}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}