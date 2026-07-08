// app/(protected)/organizations/teams/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationTeamsPage } from '@/frontend/modules/organizations/pages/OrganizationTeamsPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationTeamsPage />;
}