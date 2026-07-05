// frontend/modules/auth/components/ResetPasswordForm.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordFormSchema, ResetPasswordFormValues } from '../schemas';
import { authApi } from '../services/auth.api';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, values.newPassword);
      router.push('/auth/login?reset=success');
    } catch (err: any) {
      setError(err?.error || 'This reset link is invalid or has expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Resetting...' : 'Reset password'}
      </Button>
    </form>
  );
}