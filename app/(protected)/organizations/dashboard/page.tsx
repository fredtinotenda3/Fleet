// app/(protected)/organizations/dashboard/page.tsx

'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationDashboardPage } from '@/frontend/modules/organizations/pages/OrganizationDashboardPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <PageLoader label="Loading your account" />;
  }

  return <OrganizationDashboardPage currentUserId={user.id} />;
}