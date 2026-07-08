// frontend/modules/organizations/pages/OrganizationDashboardPage.tsx

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings, Users, Shield, FileClock } from 'lucide-react';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
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
  const { data: statistics, isLoading: isStatsLoading } = useOrganizationStatistics(
    organization?._id
  );

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
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-h1">{organization.name}</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Organization overview and key metrics
          </p>
        </div>
      </div>

      <OverviewStatsGrid
        statistics={statistics}
        currency={organization.settings.currency}
        isLoading={isStatsLoading}
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
        <UsageCard statistics={statistics} isLoading={isStatsLoading} />

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