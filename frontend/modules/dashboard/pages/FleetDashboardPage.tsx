// frontend/modules/dashboard/pages/FleetDashboardPage.tsx

'use client';

import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { DashboardGrid } from '@/frontend/shared/dashboards/DashboardGrid';
import { DashboardBuilder, DashboardBuilderToggle } from '@/frontend/shared/dashboards/DashboardBuilder';
import { useSessionStore } from '@/frontend/shared/store/session.store';

export function FleetDashboardPage() {
  const user = useSessionStore((s) => s.user);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Here's what's happening across your fleet today."
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={<DashboardBuilderToggle />}
      />
      <DashboardBuilder />
      <DashboardGrid />
    </div>
  );
}