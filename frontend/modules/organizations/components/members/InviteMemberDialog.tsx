// frontend/modules/organizations/components/members/InviteMemberDialog.tsx
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
  DialogTrigger,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { inviteMemberSchema, InviteMemberFormValues } from '../../schemas';
import { useInviteMember } from '../../hooks/useOrganizationMutations';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../../types';
import type { OrganizationRole, InviteMemberPayload } from '../../types';

interface InviteMemberDialogProps {
  organizationId: string;
  trigger: React.ReactElement;
}

export function InviteMemberDialog({ organizationId, trigger }: InviteMemberDialogProps) {
  const mutation = useInviteMember(organizationId);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'viewer' as OrganizationRole },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Cast to InviteMemberPayload since we validated with zod
    const payload: InviteMemberPayload = {
      email: values.email,
      role: values.role as OrganizationRole,
    };
    await mutation.mutateAsync(payload);
    reset();
  });

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-form-narrow">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email with a link to join. Invitations expire after 7 days.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="invite-email" className="form-label form-required">
              Email address
            </Label>
            <Input
              id="invite-email"
              type="email"
              className={errors.email ? 'input-error' : 'input-base'}
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <div>
            <Label htmlFor="invite-role" className="form-label form-required">
              Role
            </Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role" className="input-base">
                    <SelectValue placeholder="Select role" />
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
            {errors.role && <p className="form-error">{errors.role.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {(isSubmitting || mutation.isPending) && <Spinner className="w-4 h-4 mr-2" />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}