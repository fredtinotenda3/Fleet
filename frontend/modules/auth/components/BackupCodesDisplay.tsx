// frontend/modules/auth/components/BackupCodesDisplay.tsx

'use client';

import { Button } from '@/frontend/shared/ui/primitives/button';

interface BackupCodesDisplayProps {
  codes: string[];
  title?: string;
}

export function BackupCodesDisplay({ codes, title = 'Your backup codes' }: BackupCodesDisplayProps) {
  const handleDownload = () => {
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-md space-y-4">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">
        Store these somewhere safe. Each code can be used once if you lose access to your authenticator app. They
        will not be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <Button type="button" onClick={handleDownload}>
        Download codes
      </Button>
    </div>
  );
}