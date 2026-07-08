// frontend/modules/organizations/components/settings/ContactSection.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { contactDetailsSchema, ContactDetailsFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { toast } from 'sonner';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, ContactDetailsFormValues>;
}

// Organization type doesn't carry `contact` yet in the base interface —
// this reads the addendum field defensively until organization.types.ts
// is merged with the Phase 3 addendum.
type OrganizationWithContact = Organization & {
  contact?: Partial<ContactDetailsFormValues>;
};

export function ContactSection({ organization, mutation }: Props) {
  const contact = (organization as OrganizationWithContact).contact;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ContactDetailsFormValues>({
    resolver: zodResolver(contactDetailsSchema),
    defaultValues: {
      contactEmail: contact?.contactEmail || '',
      contactPhone: contact?.contactPhone || '',
      addressLine1: contact?.addressLine1 || '',
      addressLine2: contact?.addressLine2 || '',
      city: contact?.city || '',
      state: contact?.state || '',
      postalCode: contact?.postalCode || '',
      country: contact?.country || '',
    },
  });

  const onSubmit = (data: ContactDetailsFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('Contact details updated'),
      onError: () => toast.error('Failed to update contact details'),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
      <div>
        <Label htmlFor="contactEmail" className="form-label form-required">
          Contact email
        </Label>
        <Input id="contactEmail" type="email" className="input-base" {...register('contactEmail')} />
        {errors.contactEmail && <p className="form-error">{errors.contactEmail.message}</p>}
      </div>

      <div>
        <Label htmlFor="contactPhone" className="form-label">
          Contact phone
        </Label>
        <Input id="contactPhone" className="input-base" {...register('contactPhone')} placeholder="+263 77 000 0000" />
        {errors.contactPhone && <p className="form-error">{errors.contactPhone.message}</p>}
      </div>

      <div>
        <Label htmlFor="addressLine1" className="form-label form-required">
          Address line 1
        </Label>
        <Input id="addressLine1" className="input-base" {...register('addressLine1')} />
        {errors.addressLine1 && <p className="form-error">{errors.addressLine1.message}</p>}
      </div>

      <div>
        <Label htmlFor="addressLine2" className="form-label">
          Address line 2
        </Label>
        <Input id="addressLine2" className="input-base" {...register('addressLine2')} />
        {errors.addressLine2 && <p className="form-error">{errors.addressLine2.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city" className="form-label form-required">
            City
          </Label>
          <Input id="city" className="input-base" {...register('city')} />
          {errors.city && <p className="form-error">{errors.city.message}</p>}
        </div>
        <div>
          <Label htmlFor="state" className="form-label">
            State / Province
          </Label>
          <Input id="state" className="input-base" {...register('state')} />
          {errors.state && <p className="form-error">{errors.state.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="postalCode" className="form-label">
            Postal code
          </Label>
          <Input id="postalCode" className="input-base" {...register('postalCode')} />
          {errors.postalCode && <p className="form-error">{errors.postalCode.message}</p>}
        </div>
        <div>
          <Label htmlFor="country" className="form-label form-required">
            Country
          </Label>
          <Input id="country" className="input-base" {...register('country')} />
          {errors.country && <p className="form-error">{errors.country.message}</p>}
        </div>
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}