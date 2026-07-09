// frontend/modules/maintenance/pages/OverdueMaintenancePage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useOverdueMaintenance } from '../hooks/useMaintenance';
import { useRecalculateOverdue } from '../hooks/useMaintenanceMutations';
import { PRIORITY_BADGE_CLASSES, getPriorityLabel, canManageMaintenance } from '../utils';
import { formatDate, getDaysUntil } from '@/shared/utils/date.utils';
import { MAINTENANCE_ROUTES } from '../routes';

export function OverdueMaintenancePage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const canManage = canManageMaintenance(user?.roles ?? []);
  const { data: records, isLoading } = useOverdueMaintenance();
  const recalculate = useRecalculateOverdue();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overdue maintenance"
        description="Records past their due date that still require action."
        breadcrumbs={[{ label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard }, { label: 'Overdue' }]}
        actions={
          canManage && (
            <Button variant="outline" size="sm" onClick={() => recalculate.mutate()} disabled={recalculate.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${recalculate.isPending ? 'animate-spin' : ''}`} />
              Refresh statuses
            </Button>
          )
        }
      />

      {isLoading ? (
        <LoadingState type="table" count={6} />
      ) : !records || records.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-muted-foreground" />}
          title="Nothing overdue"
          description="Every maintenance record in your fleet is on schedule."
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <button
              key={r._id}
              onClick={() => router.push(MAINTENANCE_ROUTES.detail(r._id))}
              className="flex items-center justify-between w-full p-4 text-left border border-red-200 rounded-md bg-red-50/40 hover:bg-red-50"
            >
              <div>
                <p className="font-medium">{r.license_plate} — {r.title}</p>
                <p className="text-xs text-muted-foreground">
                  Was due {formatDate(r.due_date)} · {Math.abs(getDaysUntil(r.due_date))} day(s) overdue
                </p>
              </div>
              <Badge className={PRIORITY_BADGE_CLASSES[r.priority ?? 'medium']}>{getPriorityLabel(r.priority)}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}