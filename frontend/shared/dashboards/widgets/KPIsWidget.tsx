// frontend/shared/dashboards/widgets/KPIsWidget.tsx

'use client';

import { Truck, Wrench, Wallet, Fuel as FuelIcon } from 'lucide-react';
import { MetricCard, MetricCardGrid } from '@/frontend/shared/ui/patterns';
import { formatCurrencyCompact } from '@/shared/utils/currency.utils';
import {
  useVehicleStatsWidget,
  useMaintenanceWidget,
  useExpenseBreakdownWidget,
  useFuelTrendsWidget,
} from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { fleetPresence, zeroTone } from '@/frontend/modules/onboarding/utils/empty-state-copy';

/**
 * The four figures at the top of the dashboard.
 *
 * FIXED HERE (UI/UX overhaul): this widget never read `isError` on any of its
 * four queries. Every value used `?? 0`, so a failed request rendered a
 * confident, plausible, wrong number rather than a failure:
 *
 *   - Fleet size showed "0" — an operator's fleet reported as empty.
 *   - Open maintenance showed "0" AND, because the colour was chosen by
 *     `maintenance.data && overdueCount > 0 ? 'red' : 'green'`, an undefined
 *     response painted the card GREEN. A backend outage was displayed as
 *     "nothing is overdue".
 *   - Expenses and fuel spend both showed "$0".
 *
 * Alone on the most-viewed screen in the product, that is the single most
 * damaging defect the audit found: unlike a spinner or an error, there is
 * nothing about a zero that tells the reader not to trust it. Each card now
 * carries its query's error state, and `MetricCard` renders "Unavailable"
 * instead of a figure.
 */
export function KPIsWidget() {
  const vehicleStats = useVehicleStatsWidget();
  const maintenance = useMaintenanceWidget();
  const expenses = useExpenseBreakdownWidget();
  const fuel = useFuelTrendsWidget();

  const total = vehicleStats.data?.total;
  const active = vehicleStats.data?.active ?? 0;
  const activePercent = total && total > 0 ? Math.round((active / total) * 100) : 0;

  const overdueCount = maintenance.data?.overdueCount;
  const upcomingCount = maintenance.data?.upcoming.length ?? 0;

  return (
    <MetricCardGrid columns={4}>
      <MetricCard
        label="Fleet size"
        value={total !== undefined ? total.toLocaleString() : null}
        hint={total !== undefined ? `${active.toLocaleString()} active (${activePercent}%)` : undefined}
        icon={<Truck aria-hidden="true" />}
        loading={vehicleStats.isLoading}
        error={vehicleStats.isError}
        href="/vehicles"
      />

      <MetricCard
        label="Open maintenance"
        value={overdueCount !== undefined ? overdueCount.toLocaleString() : null}
        hint={overdueCount !== undefined ? `${upcomingCount.toLocaleString()} due soon` : undefined}
        icon={<Wrench aria-hidden="true" />}
        loading={maintenance.isLoading}
        error={maintenance.isError}
        /*
          Tone is derived only from a value that was actually received. An
          absent response is neutral, never "positive" — that was the
          original bug.

          EMPTY-ORGANISATION ROUND: a received 0 was still painted green
          unconditionally, so an organisation with no vehicles was
          congratulated on having no overdue maintenance. Zero out of
          zero is not an achievement. `zeroTone` earns the green only
          once there is a fleet the zero could be about; the fleet size
          is already in hand here, so this costs no extra request.
        */
        tone={
          overdueCount === undefined
            ? 'neutral'
            : overdueCount > 0
              ? 'critical'
              : zeroTone(fleetPresence(total, vehicleStats.isSuccess))
        }
        href="/maintenance/overdue"
      />

      <MetricCard
        label="Total expenses"
        value={expenses.data ? formatCurrencyCompact(expenses.data.total) : null}
        hint="All recorded expenses"
        icon={<Wallet aria-hidden="true" />}
        loading={expenses.isLoading}
        error={expenses.isError}
        href="/expenses"
      />

      <MetricCard
        label="Fuel spend"
        value={fuel.data ? formatCurrencyCompact(fuel.data.totalCost) : null}
        hint={
          fuel.data ? `${Math.round(fuel.data.totalVolume).toLocaleString()} L logged` : undefined
        }
        icon={<FuelIcon aria-hidden="true" />}
        loading={fuel.isLoading}
        error={fuel.isError}
        href="/fuel"
      />
    </MetricCardGrid>
  );
}
