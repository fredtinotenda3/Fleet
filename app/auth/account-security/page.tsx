
// app/auth/account-security/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { AccountSecurityPage } from '@/frontend/modules/auth/pages/AccountSecurityPage';

export default function Page() {
  return (
    <RouteGuard>
      <AccountSecurityPage />
    </RouteGuard>
  );
}
