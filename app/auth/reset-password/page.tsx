
// app/auth/reset-password/page.tsx
//
// Wrapped in Suspense because ResetPasswordPage reads the `token`
// query param via useSearchParams(), which Next.js 15 requires to be
// inside a Suspense boundary during static rendering.

import { Suspense } from 'react';
import { ResetPasswordPage } from '@/frontend/modules/auth/pages/ResetPasswordPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}

