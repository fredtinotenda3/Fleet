// app/(protected)/organizations/select/page.tsx

'use client';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { OrganizationSelectPage } from '@/frontend/modules/organizations/pages/OrganizationSelectPage';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function Page() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <PageLoader label="Loading your account" />;
  }

  return <OrganizationSelectPage currentUserId={user.id} />;
}