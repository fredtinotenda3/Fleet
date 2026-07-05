
// app/auth/profile/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { ProfilePage } from '@/frontend/modules/auth/pages/ProfilePage';

export default function Page() {
  return (
    <RouteGuard>
      <ProfilePage />
    </RouteGuard>
  );
}
