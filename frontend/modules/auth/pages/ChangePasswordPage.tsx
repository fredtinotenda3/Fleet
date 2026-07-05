// frontend/modules/auth/pages/ChangePasswordPage.tsx

'use client';

import { ChangePasswordForm } from '../components/ChangePasswordForm';

export function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="text-sm text-muted-foreground">Changing your password signs out every other device.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}