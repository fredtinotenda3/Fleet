// frontend/modules/organizations/components/analytics/OrgAnalyticsCharts.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Truck, Wallet, Activity } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { useOrganizationStatistics } from '../../hooks/useOrganizations';
import { useOrganizationActivitySummary } from '../../hooks/useAdvancedSettings';
import type { Organization } from '../../types';

interface Props {
  organization: Organization;
}

export function OrgAnalyticsCharts({ organization }: Props) {
  const { data: statistics, isLoading: statsLoading } = useOrganizationStatistics(organization._id);
  const { data: activity, isLoading: activityLoading } = useOrganizationActivitySummary(organization._id);

  const isLoading = statsLoading || activityLoading;

  if (isLoading || !statistics) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 surface-card h-28">
            <div className="w-24 h-4 mb-3 skeleton" />
            <div className="w-16 skeleton h-7" />
          </div>
        ))}
      </div>
    );
  }

  const activityChartData = [
    { period: 'Prior 23 days', events: Math.max((activity?.last30DaysAuditEvents ?? 0) - (activity?.last7DaysAuditEvents ?? 0), 0) },
    { period: 'Last 7 days', events: activity?.last7DaysAuditEvents ?? 0 },
  ];

  const storageApiData = [
    { name: 'Storage (GB)', used: statistics.storageUsedGb, limit: statistics.storageLimitGb },
    { name: 'API calls (k)', used: statistics.apiCallsThisMonth / 1000, limit: statistics.apiCallLimit / 1000 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Active users"
          value={`${statistics.activeUsers} / ${statistics.totalUsers}`}
          icon={<Users />}
          description={`${statistics.pendingInvites} invitation${statistics.pendingInvites === 1 ? '' : 's'} pending`}
        />
        <StatsCard
          title="Fleet size"
          value={statistics.vehicleCount}
          icon={<Truck />}
          description={`${statistics.activeVehicles} active`}
        />
        <StatsCard
          title="Expenses this month"
          value={formatCurrency(statistics.totalExpensesThisMonth, { currency: organization.settings.currency })}
          icon={<Wallet />}
        />
        <StatsCard
          title="Audit events (30d)"
          value={activity?.last30DaysAuditEvents ?? 0}
          icon={<Activity />}
          description={`${activity?.last7DaysAuditEvents ?? 0} in the last 7 days`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="p-5 surface-card">
          <h3 className="mb-4 text-h3">Audit activity trend</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={activityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="events" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 surface-card">
          <h3 className="mb-4 text-h3">Resource usage vs. limits</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={storageApiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="used" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Used" />
                <Bar dataKey="limit" fill="var(--muted)" radius={[4, 4, 0, 0]} name="Limit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}