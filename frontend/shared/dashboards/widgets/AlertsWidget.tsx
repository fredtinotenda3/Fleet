// frontend/shared/dashboards/widgets/AlertsWidget.tsx

'use client';

import { Bell } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useRecentActivityWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatRelativeDate } from '@/shared/utils/date.utils';

const PRIORITY_VARIANT: Record<string, 'default' | 'outline' | 'destructive'> = {
  low: 'outline',
  medium: 'outline',
  high: 'destructive',
  critical: 'destructive',
};

export function AlertsWidget() {
  const { data, isLoading, isError, refetch } = useRecentActivityWidget();

  return (
    <DashboardWidget
      title="Recent activity"
      icon={<Bell className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {!data || data.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">No recent activity.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((item) => (
            <li key={item._id} className="flex items-start gap-2.5">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.read ? 'bg-muted-foreground/40' : 'bg-primary'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate text-body-sm text-foreground">{item.title}</p>
                  <Badge variant={PRIORITY_VARIANT[item.priority] ?? 'outline'} className="capitalize shrink-0">
                    {item.priority}
                  </Badge>
                </div>
                <p className="truncate text-caption text-muted-foreground">{item.message}</p>
                <p className="text-caption text-muted-foreground">{formatRelativeDate(item.sentAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}