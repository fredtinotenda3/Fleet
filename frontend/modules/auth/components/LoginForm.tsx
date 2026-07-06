// frontend/modules/auth/components/LoginForm.tsx

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, LoginFormValues } from '../schemas';
import { useAuth } from '../hooks/useAuth';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { PasswordInput } from '@/frontend/shared/ui/auth';
import { SsoLoginButton } from './SsoLoginButton';
import { cn } from '@/lib/utils';

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="email" className="form-label">
          Work email
        </Label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={cn('input-base', errors.email && 'input-error')}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="form-error" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="password" className="mb-0 form-label">
            Password
          </Label>
          <a href="/auth/forgot-password" className="text-caption text-primary hover:underline">
            Forgot password?
          </a>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          error={!!errors.password}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className="form-error" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 select-none text-body-sm text-foreground">
        <input type="checkbox" className="w-4 h-4 rounded border-input accent-primary" defaultChecked />
        Remember me on this device
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full btn-base" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }} disabled={isLoading}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="relative py-1 text-center">
        <span className="relative z-10 px-2 bg-card text-caption text-muted-foreground">or</span>
        <div className="absolute inset-x-0 h-px top-1/2 bg-border" aria-hidden="true" />
      </div>

      <SsoLoginButton />
    </form>
  );
}