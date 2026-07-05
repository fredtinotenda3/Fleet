// frontend/modules/auth/pages/BackupCodesPage.tsx

'use client';

import { useState } from 'react';
import { useMFA } from '../hooks/useMFA';
import { BackupCodesDisplay } from '../components/BackupCodesDisplay';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';

export function BackupCodesPage() {
  const { backupCodes, isLoading, error, regenerateBackupCodes } = useMFA();
  const [code, setCode] = useState('');

  const handleRegenerate = async () => {
    await regenerateBackupCodes(code).catch(() => undefined);
  };

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Backup codes</h1>
        <p className="text-sm text-muted-foreground">
          Regenerating creates a brand new set and immediately invalidates any codes you have saved previously.
        </p>
      </div>

      {backupCodes ? (
        <BackupCodesDisplay codes={backupCodes} />
      ) : (
        <div className="space-y-3">
          <Label htmlFor="code">Confirm with your authenticator code</Label>
          <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="button" onClick={handleRegenerate} disabled={isLoading}>
            {isLoading ? 'Generating...' : 'Regenerate backup codes'}
          </Button>
        </div>
      )}
    </div>
  );
}