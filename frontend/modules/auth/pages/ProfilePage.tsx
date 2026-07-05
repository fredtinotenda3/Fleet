// frontend/modules/auth/pages/ProfilePage.tsx

'use client';

import { useSessionStore } from '@/frontend/shared/store/session.store';

export function ProfilePage() {
  const { user } = useSessionStore();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account details.</p>
      </div>

      <dl className="divide-y rounded border">
        <div className="flex justify-between p-4">
          <dt className="text-sm text-muted-foreground">Name</dt>
          <dd className="text-sm font-medium">{user?.name || '\u2014'}</dd>
        </div>
        <div className="flex justify-between p-4">
          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd className="text-sm font-medium">{user?.email || '\u2014'}</dd>
        </div>
        <div className="flex justify-between p-4">
          <dt className="text-sm text-muted-foreground">Roles</dt>
          <dd className="text-sm font-medium">{user?.roles?.join(', ') || '\u2014'}</dd>
        </div>
      </dl>
    </div>
  );
}