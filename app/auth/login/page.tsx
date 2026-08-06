// app/auth/login/page.tsx
//
// Wrapped in Suspense because LoginPage reads the `callbackUrl` query
// param via useSearchParams(), which Next.js 15 requires to be inside
// a Suspense boundary during static rendering (same pattern as
// app/auth/reset-password/page.tsx).

import { Suspense } from 'react';
import { LoginPage } from '@/frontend/modules/auth/pages/LoginPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}