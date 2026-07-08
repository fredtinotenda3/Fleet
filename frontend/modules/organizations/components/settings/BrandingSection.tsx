// frontend/modules/organizations/components/settings/BrandingSection.tsx
'use client';

import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { brandingSchema, BrandingFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { toast } from 'sonner';
import { getInitials } from '../../utils';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, BrandingFormValues>;
  uploadLogo: UseMutationResult<unknown, unknown, File>;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export function BrandingSection({ organization, mutation, uploadLogo }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(organization.branding.logoUrl || null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      primaryColor: organization.branding.primaryColor || '#3b82f6',
      logoUrl: organization.branding.logoUrl || '',
      faviconUrl: organization.branding.faviconUrl || '',
      theme: organization.branding.theme || 'system',
    },
  });

  const onSubmit = (data: BrandingFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('Branding updated'),
      onError: () => toast.error('Failed to update branding'),
    });
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLogoError('Use PNG, JPEG, SVG, or WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo must be under 2MB.');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    uploadLogo.mutate(file, {
      onSuccess: () => toast.success('Logo uploaded'),
      onError: () => {
        toast.error('Failed to upload logo');
        setPreviewUrl(organization.branding.logoUrl || null);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="form-section max-w-form-narrow">
        <div>
          <Label className="form-label">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 overflow-hidden border rounded-lg border-border bg-muted">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Organization logo" className="object-cover w-full h-full" />
              ) : (
                <span className="text-h3 text-muted-foreground">{getInitials(organization.name)}</span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                className="hidden"
                onChange={handleLogoSelect}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? 'Uploading…' : 'Upload new logo'}
              </Button>
              <p className="form-hint">PNG, JPEG, SVG, or WebP. Max 2MB.</p>
            </div>
          </div>
          {logoError && <p className="form-error">{logoError}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
        <div>
          <Label htmlFor="primaryColor" className="form-label form-required">
            Primary color
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="border rounded-md h-9 w-9 border-input"
              {...register('primaryColor')}
            />
            <Input id="primaryColor" className="input-base" {...register('primaryColor')} placeholder="#3b82f6" />
          </div>
          {errors.primaryColor && <p className="form-error">{errors.primaryColor.message}</p>}
        </div>

        <div>
          <Label htmlFor="faviconUrl" className="form-label">
            Favicon URL
          </Label>
          <Input id="faviconUrl" className="input-base" {...register('faviconUrl')} placeholder="https://…" />
          {errors.faviconUrl && <p className="form-error">{errors.faviconUrl.message}</p>}
        </div>

        <div>
          <Label htmlFor="theme" className="form-label form-required">
            Theme
          </Label>
          <Controller
            control={control}
            name="theme"
            defaultValue="system"
            render={({ field }) => (
              <Select value={field.value || 'system'} onValueChange={field.onChange}>
                <SelectTrigger id="theme" className="input-base">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.theme && <p className="form-error">{errors.theme.message}</p>}
        </div>

        <Button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  );
}