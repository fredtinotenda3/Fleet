// frontend/modules/auth/components/LoginForm.tsx

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, LoginFormValues } from '../schemas';
import { useAuth } from '../hooks/useAuth';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { SsoLoginButton } from './SsoLoginButton';

interface LoginFormProps {
  onMfaRequired: () => void;
  onSuccess: () => void;
}

export function LoginForm({ onMfaRequired, onSuccess }: LoginFormProps) {
  const { login, isLoading, error } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    const result = await login(values.email, values.password).catch(() => null);
    if (!result) return;
    if (result.mfaRequired) {
      onMfaRequired();
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} />
        {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a href="/auth/forgot-password" className="text-sm text-muted-foreground hover:underline">
            Forgot password?
          </a>
        </div>
        <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Signing in...' : 'Sign in'}
      </Button>

      <div className="relative py-2 text-center text-xs text-muted-foreground">
        <span className="bg-background px-2">or</span>
      </div>

      <SsoLoginButton />
    </form>
  );
}