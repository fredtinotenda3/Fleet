// frontend/modules/auth/components/ChangePasswordForm.tsx

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordFormSchema, ChangePasswordFormValues } from '../schemas';
import { authApi } from '../services/auth.api';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';

export function ChangePasswordForm() {
  const { accessToken } = useSessionStore();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordFormSchema) });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await authApi.changePassword(values, accessToken || undefined);
      setSuccess(true);
      reset();
    } catch (err: any) {
      setError(err?.error || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} />
        {errors.currentPassword && <p className="text-sm text-red-500">{errors.currentPassword.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
        {errors.newPassword && <p className="text-sm text-red-500">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-green-600">Password changed. Other devices have been signed out.</p>}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Update password'}
      </Button>
    </form>
  );
}