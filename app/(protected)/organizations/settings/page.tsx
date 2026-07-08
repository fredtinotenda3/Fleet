// app/(protected)/organizations/settings/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationSettingsPage } from '@/frontend/modules/organizations/pages/OrganizationSettingsPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationSettingsPage />;
}