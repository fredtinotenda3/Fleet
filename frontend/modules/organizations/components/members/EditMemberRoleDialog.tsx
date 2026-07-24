// frontend/modules/organizations/components/members/EditMemberRoleDialog.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { editMemberRoleSchema, EditMemberRoleFormValues } from '../../schemas';
import { useUpdateMemberRole } from '../../hooks/useOrganizationMutations';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../../types';
import type { OrganizationMember } from '../../types';

interface EditMemberRoleDialogProps {
  organizationId: string;
  member: OrganizationMember | null;
  onClose: () => void;
}

export function EditMemberRoleDialog({ organizationId, member, onClose }: EditMemberRoleDialogProps) {
  const mutation = useUpdateMemberRole(organizationId);

  const { control, handleSubmit, formState: { isSubmitting } } = useForm<EditMemberRoleFormValues>({
    resolver: zodResolver(editMemberRoleSchema),
    values: { role: (member?.role ?? 'viewer') as EditMemberRoleFormValues['role'] },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!member) return;
    await mutation.mutateAsync({ memberId: member.userId, role: values.role as any });
    onClose();
  });

  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-form-narrow">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update {member?.name}&apos;s role within this organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-role" className="form-label form-required">
              Role
            </Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="edit-role" className="input-base">
                    <SelectValue placeholder="Select role">
                      {(v: string) => ROLE_LABELS[v as keyof typeof ROLE_LABELS] ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {(isSubmitting || mutation.isPending) && <Spinner className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}