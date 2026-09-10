// frontend/modules/organizations/components/dashboard/OverviewStatsGrid.tsx

'use client';

import { Users, Truck, Wallet, UserCheck } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { OrganizationStatistics } from '../../types';

interface OverviewStatsGridProps {
  statistics: OrganizationStatistics | undefined;
  currency: string;
  isLoading: boolean;
  /**
   * ADDED (empty-organisation round): the grid took only `isLoading`, so
   * `isLoading || !statistics` swallowed a FAILED request into the
   * skeleton branch -- the organisation dashboard showed four shimmering
   * placeholders forever, with nothing saying the request had failed and
   * no way to tell that from a slow network.
   */
  isError?: boolean;
}

function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function OverviewStatsGrid({
  statistics,
  currency,
  isLoading,
  isError = false,
}: OverviewStatsGridProps) {
  if (isError || (!isLoading && !statistics)) {
    // Says so, rather than shimmering indefinitely.
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {['Active users', 'Fleet size', 'Expenses this month', 'Seats used'].map((title) => (
          <StatsCard key={title} title={title} value={null} error errorMessage="Unavailable" />
        ))}
      </div>
    );
  }

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

  const expenseChange = percentChange(
    statistics.totalExpensesThisMonth,
    statistics.totalExpensesLastMonth
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Active users"
        value={`${statistics.activeUsers} / ${statistics.totalUsers}`}
        icon={<Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        /*
          "All invitations resolved" was shown to an organisation that
          has never sent one -- a completion claim about work that was
          never started. Same family as "your fleet is up to date" on a
          fleet of zero.
        */
        description={
          statistics.pendingInvites > 0
            ? `${statistics.pendingInvites} invitation${statistics.pendingInvites === 1 ? '' : 's'} pending`
            : statistics.totalUsers > 1
              ? 'All invitations resolved'
              : 'Invite your team to collaborate'
        }
      />
      <StatsCard
        title="Fleet size"
        value={statistics.vehicleCount}
        icon={<Truck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        description={`${statistics.activeVehicles} active`}
      />
      <StatsCard
        title="Expenses this month"
        value={formatCurrency(statistics.totalExpensesThisMonth, { currency })}
        icon={<Wallet className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        trend={
          expenseChange !== undefined 
            ? { 
                // We use Math.abs here because StatsCard prepends a "+" if isPositive is true,
                // and for expenses, a negative change is considered positive for the business. 
                value: Math.abs(Number(expenseChange.toFixed(1))), 
                isPositive: expenseChange <= 0 
              } 
            : undefined
        }
      />
      <StatsCard
        title="Seats used"
        value={`${statistics.seatsUsed} / ${statistics.seatsTotal}`}
        icon={<UserCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        description={
          statistics.seatsUsed >= statistics.seatsTotal
            ? 'Seat limit reached — upgrade to add more'
            : `${statistics.seatsTotal - statistics.seatsUsed} seats available`
        }
      />
    </div>
  );
}