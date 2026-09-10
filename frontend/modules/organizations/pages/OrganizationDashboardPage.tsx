// frontend/modules/organizations/pages/OrganizationDashboardPage.tsx

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings, Users, Shield, FileClock } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { GetStartedPanel } from '@/frontend/modules/onboarding';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { useOrganizationStatistics } from '../hooks/useOrganizations';
import { OverviewStatsGrid } from '../components/dashboard/OverviewStatsGrid';
import { BillingSummaryCard } from '../components/dashboard/BillingSummaryCard';
import { UsageCard } from '../components/dashboard/UsageCard';
import { RecentMembersCard } from '../components/dashboard/RecentMembersCard';
import { canManageBilling, canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

interface OrganizationDashboardPageProps {
  currentUserId: string;
}

const QUICK_LINKS = [
  { href: ORGANIZATION_ROUTES.settings.root, label: 'Organization settings', icon: Settings },
  { href: ORGANIZATION_ROUTES.members.root, label: 'Manage members', icon: Users },
  { href: ORGANIZATION_ROUTES.roles, label: 'Roles & permissions', icon: Shield },
  { href: ORGANIZATION_ROUTES.audit, label: 'Audit log', icon: FileClock },
] as const;

export function OrganizationDashboardPage({ currentUserId }: OrganizationDashboardPageProps) {
  const router = useRouter();
  const { organization, currentUserRole, isLoading, isError } =
    useCurrentOrganization(currentUserId);
  const {
    data: statistics,
    isLoading: isStatsLoading,
    isError: isStatsError,
  } = useOrganizationStatistics(organization?._id);

  if (isLoading) {
    return <PageLoader label="Loading organization dashboard" />;
  }

  if (isError || !organization) {
    return (
      <EmptyState
        title="No organization selected"
        description="Select or create an organization to view its dashboard."
        action={{
          label: "Choose organization",
          onClick: () => router.push(ORGANIZATION_ROUTES.select)
        }}
      />
    );
  }

  const role = currentUserRole ?? 'viewer';

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title={organization.name}
        description="Organization overview and key metrics"
      />

      {/*
        EMPTY-ORGANISATION FIX. `GetStartedPanel` was mounted only in
        FleetDashboardPage -- but app/(protected)/dashboard/page.tsx routes
        anyone holding ORG_MANAGE here instead, and the three roles that
        hold ORG_MANAGE are exactly the roles that hold all four of the
        checklist's anchor permissions. So on a genuinely fresh
        organisation the setup checklist was unreachable by the ONLY
        accounts able to act on it: the founding owner saw member counts
        and a billing card, and nothing telling them to add a vehicle.

        The panel derives its own state from real data and renders nothing
        once setup is complete or dismissed, so mounting it here costs an
        established organisation nothing. It sits ABOVE the stats grid
        deliberately -- a wall of zeroes is not the first thing a new
        customer should have to interpret.
      */}
      <GetStartedPanel />

      <OverviewStatsGrid
        statistics={statistics}
        currency={organization.settings.currency}
        isLoading={isStatsLoading}
        isError={isStatsError}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentMembersCard members={organization.members} />
        </div>
        <div className="space-y-4">
          <BillingSummaryCard organization={organization} canManageBilling={canManageBilling(role)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UsageCard statistics={statistics} isLoading={isStatsLoading} isError={isStatsError} />

        <div className="p-5 surface-card xl:col-span-2">
          <h3 className="mb-4 text-h3">Quick links</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUICK_LINKS.filter(
              (link) => link.href !== ORGANIZATION_ROUTES.members.root || canManageMembers(role)
            ).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted"
              >
                <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}