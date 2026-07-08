// app/(protected)/organizations/advanced/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationAdvancedPage } from '@/frontend/modules/organizations/pages/OrganizationAdvancedPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationAdvancedPage />;
}