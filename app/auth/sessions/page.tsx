
// app/auth/sessions/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { SessionsPage } from '@/frontend/modules/auth/pages/SessionsPage';

export default function Page() {
  return (
    <RouteGuard>
      <SessionsPage />
    </RouteGuard>
  );
}

