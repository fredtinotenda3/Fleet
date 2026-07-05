// frontend/modules/auth/pages/MfaVerifyPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { MfaVerificationForm } from '../components/MfaVerificationForm';

export function MfaVerifyPage() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Verify your identity</h1>
      </div>
      <MfaVerificationForm onSuccess={() => router.push('/dashboard')} />
    </div>
  );
}