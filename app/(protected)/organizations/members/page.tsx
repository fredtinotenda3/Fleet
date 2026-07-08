// app/(protected)/organizations/members/page.tsx
'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationMembersPage } from '@/frontend/modules/organizations/pages/OrganizationMembersPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return <PageLoader label="Loading" />;
  return <OrganizationMembersPage />;
}