// frontend/modules/auth/pages/MfaVerifyPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { resolveLandingPath } from '@/server/permissions/landing';
import { organizationApi } from '@/frontend/modules/organizations/services/organization.api';
import { MfaVerificationForm } from '../components/MfaVerificationForm';

export function MfaVerifyPage() {
  const router = useRouter();

  // Same ADAPTIVE ONBOARDING check as LoginPage.tsx's goToLanding --
  // see that file's comment for why this is a client-side request
  // rather than a direct call to the server-side service, and why it
  // fails open to resolveLandingPath() on any error.
  const goToLanding = () => {
    const roles = useSessionStore.getState().user?.roles ?? [];
    organizationApi
      .getSetupStatus()
      .then(({ shouldRouteToSetup }) => {
        router.push(shouldRouteToSetup ? '/setup' : resolveLandingPath(roles));
      })
      .catch(() => {
        router.push(resolveLandingPath(roles));
      });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Verify your identity</h1>
      </div>
      <MfaVerificationForm onSuccess={goToLanding} />
    </div>
  );
}