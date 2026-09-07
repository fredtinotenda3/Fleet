// frontend/modules/dashboard/pages/FleetDashboardPage.tsx

'use client';

import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { DashboardGrid } from '@/frontend/shared/dashboards/DashboardGrid';
import { DashboardBuilder, DashboardBuilderToggle } from '@/frontend/shared/dashboards/DashboardBuilder';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { CommandCentrePage } from '@/frontend/modules/attention';
import { GetStartedPanel } from '@/frontend/modules/onboarding';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { describeWorkspace } from '@/frontend/modules/onboarding/utils/role-orientation';

/**
 * The operational landing page.
 *
 * The attention queue is the primary view rather than a widget buried in a
 * KPI grid — "Command Centre" is the default tab and the KPI wall lives
 * behind "Widgets", with its DashboardBuilder, layout persistence and
 * per-widget permission gating untouched.
 *
 * UI/UX OVERHAUL additions:
 *   * GetStartedPanel above the tabs. It renders a real, data-derived setup
 *     checklist for whoever is configuring the organization, an orientation
 *     card for everyone else, and nothing at all once setup is genuinely
 *     complete or the user has dismissed it. Before this, a brand-new
 *     customer with an empty database landed on a grid of zeroes with no
 *     indication of what to do — the single worst first impression the
 *     product could give.
 *   * The description is role-derived rather than the same sentence for
 *     everyone, so a mechanic and an owner are told what THEY are looking at.
 */
export function FleetDashboardPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description={describeWorkspace(roles)}
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      <GetStartedPanel />

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
