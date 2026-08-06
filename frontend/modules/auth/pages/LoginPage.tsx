// frontend/modules/auth/pages/LoginPage.tsx

'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '../components/LoginForm';
import { MfaVerificationForm } from '../components/MfaVerificationForm';
import { AuthLayout, AuthCard } from '@/frontend/shared/ui/auth';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { resolveLandingPath, isSafeRedirectPath } from '@/server/permissions/landing';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [needsMfa, setNeedsMfa] = useState(false);

  /**
   * FIX: both success handlers used to be a hardcoded
   * `router.push('/dashboard')`, which had two consequences.
   *
   *   1. It discarded the `callbackUrl` that middleware.ts attaches when
   *      it bounces an unauthenticated user off a protected page. A user
   *      who clicked a deep link to /vehicles/123 was silently dumped on
   *      the dashboard after logging in.
   *   2. It sent DRIVER and MECHANIC accounts to a page built out of
   *      widgets they hold no permission for, so they saw an empty
   *      screen. resolveLandingPath() routes them to /trips and
   *      /maintenance respectively.
   *
   * callbackUrl is validated before use -- an unvalidated redirect
   * parameter is an open-redirect phishing primitive.
   */
  const goToLanding = useCallback(() => {
    const callbackUrl = searchParams?.get('callbackUrl');
    if (isSafeRedirectPath(callbackUrl)) {
      router.push(callbackUrl as string);
      return;
    }
    const roles = useSessionStore.getState().user?.roles ?? [];
    router.push(resolveLandingPath(roles));
  }, [router, searchParams]);

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
          <LoginForm onMfaRequired={() => setNeedsMfa(true)} onSuccess={goToLanding} />
        ) : (
          <MfaVerificationForm onSuccess={goToLanding} />
        )}
      </AuthCard>
    </AuthLayout>
  );
}