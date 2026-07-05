// frontend/modules/auth/components/MfaVerificationForm.tsx

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { mfaCodeFormSchema, MfaCodeFormValues } from '../schemas';
import { useAuth } from '../hooks/useAuth';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';

interface MfaVerificationFormProps {
  onSuccess: () => void;
}

export function MfaVerificationForm({ onSuccess }: MfaVerificationFormProps) {
  const { submitMfaCode, isLoading, error } = useAuth();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaCodeFormValues>({ resolver: zodResolver(mfaCodeFormSchema) });

  const onSubmit = async (values: MfaCodeFormValues) => {
    const result = await submitMfaCode(useBackupCode ? undefined : values.code, useBackupCode ? values.backupCode : undefined).catch(
      () => null
    );
    if (result && !result.mfaRequired) onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app{useBackupCode ? ', or a backup code' : ''}.
      </p>

      {!useBackupCode ? (
        <div className="space-y-1.5">
          <Label htmlFor="code">Authentication code</Label>
          <Input id="code" inputMode="numeric" maxLength={6} autoFocus {...register('code')} />
          {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="backupCode">Backup code</Label>
          <Input id="backupCode" autoFocus {...register('backupCode')} />
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Verifying...' : 'Verify'}
      </Button>

      <button
        type="button"
        className="w-full text-center text-sm text-muted-foreground hover:underline"
        onClick={() => setUseBackupCode((v) => !v)}
      >
        {useBackupCode ? 'Use authenticator app instead' : "Can't access your authenticator app?"}
      </button>
    </form>
  );
}