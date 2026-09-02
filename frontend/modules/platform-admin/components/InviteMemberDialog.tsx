// frontend/modules/platform-admin/components/InviteMemberDialog.tsx
'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Alert, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import type { InviteMemberPayload } from '../types';
import { assignableRoleOptions, validateInviteMember } from '../utils/platform-access.utils';
import type { FieldErrors } from '../utils/platform-admin.utils';

interface InviteMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: InviteMemberPayload) => Promise<unknown>;
  isSubmitting?: boolean;
  organizationName?: string;
  /** Seats used / total, when the organization document carries them. Rendered as context, not a gate. */
  seats?: { used: number; total: number } | null;
}

const EMPTY = { email: '', role: '' };

/**
 * Invite someone to an organization.
 *
 * VALIDATION IS ENTIRELY CLIENT-SIDE HERE, and that is a statement
 * about the backend, not a preference:
 * `OrganizationController.inviteMember` destructures
 * `{ email, role, orgUnitId }` straight off the request body with no
 * zod schema at all. `OrganizationService.addMember` then checks the
 * role against ORGANIZATION_ROLES and the seat limit -- but nothing
 * anywhere validates the email. An empty or malformed address would be
 * accepted and stored as an invite nobody can ever accept, so
 * `validateInviteMember` is the only check that exists.
 *
 * The seat line is context, not a gate: the authoritative check is
 * server-side (SEAT_LIMIT_REACHED) and racing it client-side would be
 * both wrong and unnecessary. Showing the numbers just means the
 * operator is not surprised by the rejection.
 */
export function InviteMemberDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  organizationName,
  seats,
}: InviteMemberDialogProps) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const options = assignableRoleOptions();

  function close() {
    setValues(EMPTY);
    setErrors({});
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateInviteMember(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    await onSubmit({ email: values.email.trim().toLowerCase(), role: values.role });
    close();
  }

  const atSeatLimit = seats ? seats.used >= seats.total : false;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>
              {organizationName
                ? `They'll be emailed an invitation to join ${organizationName}.`
                : "They'll be emailed an invitation to join."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {seats && (
              <Alert variant={atSeatLimit ? 'destructive' : undefined}>
                <Info className="size-4" aria-hidden="true" />
                <AlertDescription>
                  {atSeatLimit
                    ? `This organization is using all ${seats.total} of its seats. The invitation will be rejected until a seat frees up or the plan is upgraded.`
                    : `Using ${seats.used} of ${seats.total} seats.`}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-invite-email">Email</Label>
              <Input
                id="platform-admin-invite-email"
                type="email"
                value={values.email}
                onChange={(event) => {
                  const email = event.target.value;
                  setValues((current) => ({ ...current, email }));
                  setErrors((current) => ({ ...current, email: '' }));
                }}
                placeholder="person@example.com"
                aria-invalid={Boolean(errors.email) || undefined}
              />
              {errors.email && <p className="text-body-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-invite-role">Role</Label>
              <Select
                value={values.role}
                onValueChange={(next) => {
                  setValues((current) => ({ ...current, role: (next as string | null) ?? '' }));
                  setErrors((current) => ({ ...current, role: '' }));
                }}
              >
                <SelectTrigger id="platform-admin-invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.role && <p className="text-body-sm text-destructive">{errors.role}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="size-3.5" />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
