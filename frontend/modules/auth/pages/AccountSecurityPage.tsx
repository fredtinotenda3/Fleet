// frontend/modules/auth/pages/AccountSecurityPage.tsx

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useMFA } from '../hooks/useMFA';
import { Button } from '@/frontend/shared/ui/primitives/button';

export function AccountSecurityPage() {
  const { status, fetchStatus, disableMfa, isLoading } = useMFA();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p className="text-sm text-muted-foreground">Manage two-factor authentication, sessions, and password.</p>
      </div>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-base font-medium">Two-factor authentication</h2>
        {status?.enabled ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600">Enabled</p>
              <p className="text-xs text-muted-foreground">{status.remainingBackupCodes} backup codes remaining</p>
            </div>
            <div className="flex gap-2">
              <Link href="/auth/backup-codes">
                <Button variant="outline" size="sm">
                  Manage backup codes
                </Button>
              </Link>
              <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => disableMfa()}>
                Disable
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Not enabled.</p>
            <Link href="/auth/mfa-enroll">
              <Button size="sm">Enable MFA</Button>
            </Link>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-base font-medium">Password</h2>
        <Link href="/auth/change-password">
          <Button variant="outline" size="sm">
            Change password
          </Button>
        </Link>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-base font-medium">Sessions</h2>
        <Link href="/auth/sessions">
          <Button variant="outline" size="sm">
            Manage sessions
          </Button>
        </Link>
      </section>
    </div>
  );
}