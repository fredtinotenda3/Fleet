// frontend/modules/auth/pages/ForgotPasswordPage.tsx

'use client';

import { ForgotPasswordForm } from '../components/ForgotPasswordForm';

export function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}