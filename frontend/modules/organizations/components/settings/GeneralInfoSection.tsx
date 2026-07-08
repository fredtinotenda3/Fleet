// frontend/modules/organizations/components/settings/GeneralInfoSection.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { generalInfoSchema, GeneralInfoFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { toast } from 'sonner';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, GeneralInfoFormValues>;
}

export function GeneralInfoSection({ organization, mutation }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<GeneralInfoFormValues>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: {
      name: organization.name,
      companyName: organization.branding.companyName,
    },
  });

  const onSubmit = (data: GeneralInfoFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('General info updated'),
      onError: () => toast.error('Failed to update general info'),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
      <div>
        <Label htmlFor="name" className="form-label form-required">
          Organization name
        </Label>
        <Input id="name" className="input-base" {...register('name')} />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="companyName" className="form-label form-required">
          Company name
        </Label>
        <Input id="companyName" className="input-base" {...register('companyName')} />
        {errors.companyName && <p className="form-error">{errors.companyName.message}</p>}
        <p className="form-hint">Shown on invoices, reports, and the branded header.</p>
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}