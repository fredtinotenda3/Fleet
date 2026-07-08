// app/(protected)/dashboard/page.tsx

'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { FleetDashboardPage } from '@/frontend/modules/dashboard/pages/FleetDashboardPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader label="Loading your dashboard" />;
  }

  return <FleetDashboardPage />;
}