// frontend/modules/auth/pages/SessionsPage.tsx

'use client';

import { SessionsList } from '../components/SessionsList';

export function SessionsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-muted-foreground">Devices and browsers currently signed in to your account.</p>
      </div>
      <SessionsList />
    </div>
  );
}