// app/auth/mfa-enroll/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { MfaEnrollPage } from '@/frontend/modules/auth/pages/MfaEnrollPage';

export default function Page() {
  return (
    <RouteGuard>
      <MfaEnrollPage />
    </RouteGuard>
  );
}

