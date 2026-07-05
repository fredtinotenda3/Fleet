
// frontend/modules/auth/pages/LoginPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '../components/LoginForm';
import { MfaVerificationForm } from '../components/MfaVerificationForm';

export function LoginPage() {
  const router = useRouter();
  const [needsMfa, setNeedsMfa] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back to Fleet Platform.</p>
      </div>
      {!needsMfa ? (
        <LoginForm onMfaRequired={() => setNeedsMfa(true)} onSuccess={() => router.push('/dashboard')} />
      ) : (
        <MfaVerificationForm onSuccess={() => router.push('/dashboard')} />
      )}
    </div>
  );
}


