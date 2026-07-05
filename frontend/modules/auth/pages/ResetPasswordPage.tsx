// frontend/modules/auth/pages/ResetPasswordPage.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { ResetPasswordForm } from '../components/ResetPasswordForm';

export function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-red-500">This reset link is missing its token. Please request a new one.</p>
      )}
    </div>
  );
}