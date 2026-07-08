// frontend/modules/organizations/components/CreateOrganizationDialog.tsx

'use client';

import { useForm } from 'react-hook-form';
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
import { Spinner } from "@/frontend/shared/ui/feedback/spinner";
import { createOrganizationSchema, type CreateOrganizationFormValues } from '../schemas';
import { useCreateOrganization } from '../hooks/useOrganizationMutations';

interface CreateOrganizationDialogProps {
  trigger: React.ReactElement;
  onCreated?: (organizationId: string) => void;
}

export function CreateOrganizationDialog({ trigger, onCreated }: CreateOrganizationDialogProps) {
  const mutation = useCreateOrganization();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationFormValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', ownerEmail: '', ownerName: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const organization = await mutation.mutateAsync(values);
    reset();
    onCreated?.(organization._id!);
  });

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-form-narrow">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Set up a new fleet organization. You can invite team members and configure settings
            afterward.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="org-name" className="form-label form-required">
              Organization name
            </Label>
            <Input
              id="org-name"
              className={errors.name ? 'input-error' : undefined}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'org-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="org-name-error" role="alert" className="form-error">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="owner-name" className="form-label form-required">
              Your name
            </Label>
            <Input
              id="owner-name"
              className={errors.ownerName ? 'input-error' : undefined}
              aria-invalid={Boolean(errors.ownerName)}
              aria-describedby={errors.ownerName ? 'owner-name-error' : undefined}
              {...register('ownerName')}
            />
            {errors.ownerName && (
              <p id="owner-name-error" role="alert" className="form-error">
                {errors.ownerName.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="owner-email" className="form-label form-required">
              Your email
            </Label>
            <Input
              id="owner-email"
              type="email"
              className={errors.ownerEmail ? 'input-error' : undefined}
              aria-invalid={Boolean(errors.ownerEmail)}
              aria-describedby={errors.ownerEmail ? 'owner-email-error' : undefined}
              {...register('ownerEmail')}
            />
            {errors.ownerEmail && (
              <p id="owner-email-error" role="alert" className="form-error">
                {errors.ownerEmail.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {(isSubmitting || mutation.isPending) && <Spinner className="w-4 h-4 mr-2" />}
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}