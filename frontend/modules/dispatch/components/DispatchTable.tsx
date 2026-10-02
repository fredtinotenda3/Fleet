// frontend/modules/dispatch/components/DispatchTable.tsx
//
// Mirrors WorkOrderTable.tsx's structure: a failure branch checked
// before the empty state (so an unreachable API never reads as "no
// dispatch jobs"), and two distinct empty states for "none raised yet"
// vs "none match these filters".

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, UserPlus, Send } from 'lucide-react';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import { DispatchStatusBadge } from './DispatchStatusBadge';
import { PRIORITY_BADGE_CLASSES, getPriorityLabel } from '../utils';
import type { DispatchJob, PaginatedResponse } from '../types';

interface DispatchTableProps {
  result: PaginatedResponse<DispatchJob> | undefined;
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onCreate?: () => void;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onView: (job: DispatchJob) => void;
  onAssign: (job: DispatchJob) => void;
  canAssign: boolean;
}

export function DispatchTable({
  result,
  isLoading,
  isError = false,
  errorMessage,
  onRetry,
  hasFilters = false,
  onClearFilters,
  onCreate,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onView,
  onAssign,
  canAssign,
}: DispatchTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<DispatchJob>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Job',
        cell: ({ row }) => <span className="block truncate max-w-55 font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'pickupLocation',
        header: 'Pickup',
        cell: ({ row }) => <span className="block truncate max-w-40">{row.original.pickupLocation}</span>,
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => (
          <Badge className={PRIORITY_BADGE_CLASSES[row.original.priority ?? 'medium']}>
            {getPriorityLabel(row.original.priority)}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <DispatchStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'scheduledFor',
        header: 'Scheduled',
        cell: ({ row }) => (row.original.scheduledFor ? formatDate(row.original.scheduledFor) : '—'),
      },
      {
        id: 'trip',
        header: 'Trip',
        cell: ({ row }) => (row.original.tripId ? <Badge variant="outline">Linked</Badge> : '—'),
      },
      {
        id: 'actions',
        header: () => <span className="block text-right">Actions</span>,
        cell: ({ row }) => {
          const job = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => onView(job)} title="View">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {canAssign && job.status === 'unassigned' && (
                <Button variant="ghost" size="icon" onClick={() => onAssign(job)} title="Assign vehicle and driver">
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [onView, onAssign, canAssign]
  );

  const empty = hasFilters ? (
    <EmptyState
      icon={<Send aria-hidden="true" />}
      title="No dispatch jobs match these filters"
      description="Every dispatch job in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Send aria-hidden="true" />}
      title="No dispatch jobs raised yet"
      description="A dispatch job is how operational demand becomes assigned, tracked work: a vehicle and driver are assigned, a trip carries out the job, and the outcome and its cost come back here."
      hints={[
        'Assign a vehicle and driver so the job belongs to a crew, not the queue.',
        'Link the trip that actually carries out the job to see its real cost.',
        'Follow it through assigned, en route, in progress and completed instead of chasing it verbally.',
      ]}
      action={onCreate ? { label: 'New dispatch job', onClick: onCreate } : undefined}
    />
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading && !result}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      caption="Dispatch jobs"
      empty={empty}
      renderMobileRow={(job) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onView(job)}
              className="text-left text-body-sm font-medium text-primary hover:underline"
            >
              {job.title}
            </button>
            <DispatchStatusBadge status={job.status} />
          </div>
          <p className="text-caption text-muted-foreground">
            {job.pickupLocation} · {getPriorityLabel(job.priority)} priority
          </p>
          {job.scheduledFor && (
            <p className="text-caption text-muted-foreground tabular-nums">
              Scheduled {formatDate(job.scheduledFor)}
            </p>
          )}
          {canAssign && job.status === 'unassigned' && (
            <Button variant="outline" size="sm" onClick={() => onAssign(job)}>
              <UserPlus className="h-3.5 w-3.5" />
              Assign vehicle and driver
            </Button>
          )}
        </div>
      )}
      pagination={
        result
          ? {
              page: result.pagination.page,
              pageSize: pageSize ?? result.pagination.limit,
              total: result.pagination.total,
              totalPages: result.pagination.totalPages,
              onPageChange,
              onPageSizeChange,
            }
          : undefined
      }
    />
  );
}
