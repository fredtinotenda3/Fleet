// frontend/modules/transport-cost/components/RecordActionsMenu.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Per-row action menu for the
// operational table, gated by BOTH lifecycle status and permission --
// never every action on every row (see OLIVINE_LIVE_OPERATING_MODEL_
// GAP_ANALYSIS.md Section 8.1/8.3). This is a UX convenience only: the
// server independently re-checks status and permission for every one of
// these actions (see transport-cost-record-command.service.ts and the
// controller's cancelSourceRecord in-handler FINANCE_MANAGE escalation)
// -- hiding an action here never substitutes for that enforcement, it
// just avoids offering an action the server would refuse anyway.

'use client';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { MoreHorizontal, Eye, Pencil, Copy, Ban, Banknote } from 'lucide-react';
import type { OperationalStatus } from '../types';

export interface RecordActionsMenuPermissions {
  canNormalize: boolean;
  canManageFinance: boolean;
}

interface RecordActionsMenuProps {
  status: OperationalStatus | undefined;
  permissions: RecordActionsMenuPermissions;
  /** Omit on the detail view itself -- "View details" from the page
   *  you're already viewing is a no-op action, not a missing one. */
  onView?: () => void;
  onEdit: () => void;
  onCorrect: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
}

export function RecordActionsMenu({ status, permissions, onView, onEdit, onCorrect, onCancel, onDuplicate }: RecordActionsMenuProps) {
  const isCancelled = status === 'cancelled';
  const isPosted = status === 'posted';
  const canEdit = permissions.canNormalize && !isCancelled;
  const canCorrect = permissions.canManageFinance && isPosted;
  // Cancelling an already-posted record reverses its ledger entry --
  // requires FINANCE_MANAGE in addition to NORMALIZE, checked server-
  // side once the record's state is known (see the controller's own
  // header comment on cancelSourceRecord). Mirrored here so the action
  // simply isn't offered rather than being offered and then refused.
  const canCancel = !isCancelled && (isPosted ? permissions.canManageFinance : permissions.canNormalize);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onView && (
          <DropdownMenuItem onSelect={onView}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            View details
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}
        {canCorrect && (
          <DropdownMenuItem onSelect={onCorrect}>
            <Banknote className="mr-2 h-3.5 w-3.5" />
            Correct posted amount
          </DropdownMenuItem>
        )}
        {permissions.canNormalize && (
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
        )}
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCancel} className="text-destructive">
              <Ban className="mr-2 h-3.5 w-3.5" />
              Cancel
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
