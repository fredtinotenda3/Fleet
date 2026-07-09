// frontend/modules/maintenance/pages/UpcomingMaintenancePage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Clock } from 'lucide-react';
import { useUpcomingMaintenance } from '../hooks/useMaintenance';
import { STATUS_BADGE_CLASSES, PRIORITY_BADGE_CLASSES, getStatusLabel, getPriorityLabel } from '../utils';
import { formatDate, getDaysUntil } from '@/shared/utils/date.utils';
import { MAINTENANCE_ROUTES } from '../routes';

export function UpcomingMaintenancePage() {
  const router = useRouter();
  const [daysAhead, setDaysAhead] = useState(7);
  const { data: records, isLoading } = useUpcomingMaintenance(daysAhead);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming maintenance"
        description="Services and inspections due in the selected window."
        breadcrumbs={[{ label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard }, { label: 'Upcoming' }]}
        actions={
          <Select value={String(daysAhead)} onValueChange={(v) => setDaysAhead(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="14">Next 14 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <LoadingState type="table" count={6} />
      ) : !records || records.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-10 h-10 text-muted-foreground" />}
          title="Nothing due soon"
          description={`No maintenance scheduled in the next ${daysAhead} days.`}
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <button
              key={r._id}
              onClick={() => router.push(MAINTENANCE_ROUTES.detail(r._id))}
              className="flex items-center justify-between w-full p-4 text-left border rounded-md hover:bg-muted surface-card"
            >
              <div>
                <p className="font-medium">{r.license_plate} — {r.title}</p>
                <p className="text-xs text-muted-foreground">
                  Due {formatDate(r.due_date)} · {getDaysUntil(r.due_date)} day(s) remaining
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className={PRIORITY_BADGE_CLASSES[r.priority ?? 'medium']}>{getPriorityLabel(r.priority)}</Badge>
                <Badge className={STATUS_BADGE_CLASSES[r.status]}>{getStatusLabel(r.status)}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}