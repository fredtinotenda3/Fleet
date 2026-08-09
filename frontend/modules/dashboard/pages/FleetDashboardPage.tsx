// frontend/modules/dashboard/pages/FleetDashboardPage.tsx

'use client';

import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { DashboardGrid } from '@/frontend/shared/dashboards/DashboardGrid';
import { DashboardBuilder, DashboardBuilderToggle } from '@/frontend/shared/dashboards/DashboardBuilder';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { CommandCentrePage } from '@/frontend/modules/attention';
import { useSessionStore } from '@/frontend/shared/store/session.store';

/**
 * Step 4 (Command Centre UI): the attention queue is now the primary
 * view of the Dashboard rather than a small widget buried in the KPI
 * grid -- "Command Centre" is the default tab, one click away from the
 * previous KPI-wall-only experience, which still lives under "Widgets"
 * unchanged (same DashboardBuilder/DashboardGrid, same per-widget
 * permission filtering). Nothing about the widget grid itself, its
 * layout persistence, or its permission gating changed -- it moved
 * behind a tab, it wasn't rebuilt.
 */
export function FleetDashboardPage() {
  const user = useSessionStore((s) => s.user);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Here's what's happening across your fleet today."
        breadcrumbs={[{ label: 'Dashboard' }]}
      />
      <Tabs defaultValue="command-centre">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="command-centre">Command Centre</TabsTrigger>
            <TabsTrigger value="widgets">Widgets</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="command-centre" className="mt-4">
          <CommandCentrePage embedded />
        </TabsContent>
        <TabsContent value="widgets" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <DashboardBuilderToggle />
          </div>
          <DashboardBuilder />
          <DashboardGrid />
        </TabsContent>
      </Tabs>
    </div>
  );
}