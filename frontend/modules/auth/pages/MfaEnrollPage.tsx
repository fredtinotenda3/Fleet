// frontend/modules/auth/pages/MfaEnrollPage.tsx

'use client';

import { MfaEnrollment } from '../components/MfaEnrollment';

export function MfaEnrollPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">Add an extra layer of security to your account.</p>
      </div>
      <MfaEnrollment />
    </div>
  );
}