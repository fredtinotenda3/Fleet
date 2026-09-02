// frontend/modules/platform-admin/components/MemberRoleDialog.tsx
'use client';

import { useEffect, useState } from 'react';
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
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import type { OrganizationMember } from '../types';
import { assignableRoleOptions, roleLabel, validateRoleChange } from '../utils/platform-access.utils';
import type { FieldErrors } from '../utils/platform-admin.utils';

interface MemberRoleDialogProps {
  open: boolean;
  member: OrganizationMember | null;
  onClose: () => void;
  onSubmit: (role: string) => Promise<unknown>;
  isSubmitting?: boolean;
  /** True when the organization has at least one custom role defined. Drives the note below. */
  hasCustomRoles?: boolean;
}

/**
 * Assign a STATIC role to a member.
 *
 * THE OPTIONS ARE ASSIGNABLE_ORGANIZATION_ROLES, not every Role.
 * `OrganizationService.updateMemberRole` validates against
 * ORGANIZATION_ROLES and separately refuses when the target member is
 * the organization owner, so offering SUPER_ADMIN (excluded from
 * ORGANIZATION_ROLES) or ORGANIZATION_OWNER (excluded from the
 * assignable subset) would present choices that can only 400.
 *
 * CUSTOM ROLES CANNOT BE ASSIGNED HERE, and the dialog says so when the
 * organization has any. `PATCH /api/organizations/:id/members/:memberId`
 * checks the value against the static Role enum, so a role created via
 * POST /api/security/roles is not an accepted value on any member
 * endpoint. Listing them in this dropdown would produce a
 * ValidationError the operator would have to decode from a toast; the
 * gap is stated instead. See PLATFORM_ADMIN_BACKEND_GAPS.md.
 */
export function MemberRoleDialog({
  open,
  member,
  onClose,
  onSubmit,
  isSubmitting = false,
  hasCustomRoles = false,
}: MemberRoleDialogProps) {
  const [role, setRole] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const options = assignableRoleOptions();

  // Seed from the member each time the dialog opens for a different
  // person, so it never shows the previous member's role.
  useEffect(() => {
    if (open && member) {
      setRole(member.role ?? '');
      setErrors({});
    }
  }, [open, member]);

  function close() {
    setRole('');
    setErrors({});
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!member) return;

    const validation = validateRoleChange({ currentRole: member.role ?? '', nextRole: role });
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    await onSubmit(role);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {member
                ? `${member.name || member.email} is currently ${roleLabel(member.role)}.`
                : 'Select a member first.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-member-role">Role</Label>
              <Select
                value={role}
                onValueChange={(next) => {
                  setRole((next as string | null) ?? '');
                  setErrors({});
                }}
              >
                <SelectTrigger id="platform-admin-member-role">
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

            {hasCustomRoles && (
              <Alert>
                <Info className="size-4" aria-hidden="true" />
                <AlertDescription>
                  Custom roles aren&apos;t listed here. The member endpoint validates against the
                  built-in role set only, so a custom role can be defined but not assigned to a
                  member yet.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !member}>
              {isSubmitting && <Spinner className="size-3.5" />}
              Save role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
