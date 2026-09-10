// frontend/shared/dashboards/widgets/MaintenanceWidget.tsx

'use client';

import Link from 'next/link';
import { Wrench, ArrowUpRight } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useMaintenanceWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { useFleetPresence } from '@/frontend/modules/onboarding/hooks/useFleetPresence';
import { emptyCopy } from '@/frontend/modules/onboarding/utils/empty-state-copy';
import { formatRelativeDate, isOverdue } from '@/shared/utils/date.utils';

export function MaintenanceWidget() {
  const { data, isLoading, isError, refetch } = useMaintenanceWidget();
  const presence = useFleetPresence();
  const items = data ? [...data.overdue, ...data.upcoming].slice(0, 6) : [];
  // "Nothing due — your fleet is up to date" was shown to organisations
  // with no vehicles at all. See empty-state-copy.ts.
  const empty = emptyCopy('maintenance', presence);

  return (
    <DashboardWidget
      title="Upcoming maintenance"
      icon={<Wrench className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
      footer={
        <Link href="/maintenance" className="flex items-center gap-1 text-body-sm text-primary hover:underline">
          View all maintenance
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="font-medium text-body-sm text-foreground">{empty.title}</p>
          <p className="mt-1 text-caption text-muted-foreground">{empty.description}</p>
          {empty.action && (
            <Link
              href={empty.action.href}
              className="inline-block mt-2 text-body-sm text-primary hover:underline"
            >
              {empty.action.label}
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((reminder) => {
            const overdue = isOverdue(reminder.due_date);
            return (
              <li key={reminder._id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium truncate text-body-sm text-foreground">{reminder.title}</p>
                  <p className="truncate text-caption text-muted-foreground">{reminder.license_plate}</p>
                </div>
                <Badge variant={overdue ? 'destructive' : 'outline'} className="shrink-0">
                  {overdue ? 'Overdue' : formatRelativeDate(reminder.due_date)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardWidget>
  );
}
