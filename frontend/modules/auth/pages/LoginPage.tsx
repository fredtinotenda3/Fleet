// frontend/modules/auth/pages/LoginPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '../components/LoginForm';
import { MfaVerificationForm } from '../components/MfaVerificationForm';
import { AuthLayout, AuthCard } from '@/frontend/shared/ui/auth';

export function LoginPage() {
  const router = useRouter();
  const [needsMfa, setNeedsMfa] = useState(false);

  return (
    <AuthLayout
      footer={
        <>
          © {new Date().getFullYear()} Fleet Platform. All rights reserved.
        </>
      }
    >
      <AuthCard
        title={needsMfa ? 'Verify your identity' : 'Sign in'}
        description={needsMfa ? 'Enter the code from your authenticator app to continue.' : 'Welcome back — sign in to your organization.'}
      >
        {!needsMfa ? (
          <LoginForm onMfaRequired={() => setNeedsMfa(true)} onSuccess={() => router.push('/dashboard')} />
        ) : (
          <MfaVerificationForm onSuccess={() => router.push('/dashboard')} />
        )}
      </AuthCard>
    </AuthLayout>
  );
}