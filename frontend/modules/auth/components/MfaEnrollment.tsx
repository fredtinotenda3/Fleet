/* eslint-disable @next/next/no-img-element */
// frontend/modules/auth/components/MfaEnrollment.tsx

'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { mfaEnrollVerifyFormSchema, MfaEnrollVerifyFormValues } from '../schemas';
import { useMFA } from '../hooks/useMFA';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { BackupCodesDisplay } from './BackupCodesDisplay';

/**
 * Three-step enrollment: start (fetch secret + otpauth URI) -> scan QR
 * -> verify a code, which promotes the factor to verified and returns
 * a fresh set of backup codes (shown exactly once).
 */
export function MfaEnrollment() {
  const { enrollment, backupCodes, isLoading, error, startEnrollment, verifyEnrollment } = useMFA();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaEnrollVerifyFormValues>({ resolver: zodResolver(mfaEnrollVerifyFormSchema) });

  useEffect(() => {
    startEnrollment();
  }, [startEnrollment]);

  useEffect(() => {
    if (!enrollment?.otpauthUri) return;
    // Uses a public QR-rendering endpoint so no extra client dependency
    // is required; swap for a local QR library if offline rendering is
    // needed.
    setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(enrollment.otpauthUri)}`);
  }, [enrollment]);

  if (backupCodes) {
    return <BackupCodesDisplay codes={backupCodes} title="Save your backup codes" />;
  }

  const onSubmit = async (values: MfaEnrollVerifyFormValues) => {
    await verifyEnrollment(values.code).catch(() => undefined);
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h3 className="text-base font-medium">1. Scan this QR code</h3>
        <p className="text-sm text-muted-foreground">
          Use an authenticator app (Google Authenticator, 1Password, Authy) to scan the code below.
        </p>
        {qrDataUrl && <img src={qrDataUrl} alt="MFA QR code" className="mt-3 rounded border" width={200} height={200} />}
        {enrollment?.secret && (
          <p className="mt-2 text-xs text-muted-foreground">
            Can&apos;t scan? Enter this code manually: <code className="font-mono">{enrollment.secret}</code>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <h3 className="text-base font-medium">2. Enter the 6-digit code</h3>
        <div className="space-y-1.5">
          <Label htmlFor="code">Verification code</Label>
          <Input id="code" inputMode="numeric" maxLength={6} {...register('code')} />
          {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Verifying...' : 'Enable MFA'}
        </Button>
      </form>
    </div>
  );
}