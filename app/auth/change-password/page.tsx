
// app/auth/change-password/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { ChangePasswordPage } from '@/frontend/modules/auth/pages/ChangePasswordPage';

export default function Page() {
  return (
    <RouteGuard>
      <ChangePasswordPage />
    </RouteGuard>
  );
}

