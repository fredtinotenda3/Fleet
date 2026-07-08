// app/(protected)/organizations/analytics/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationAnalyticsPage } from '@/frontend/modules/organizations/pages/OrganizationAnalyticsPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationAnalyticsPage />;
}