// frontend/modules/workorders/components/WorkOrderTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, UserPlus, ClipboardList } from 'lucide-react';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import { WorkOrderStatusBadge } from './WorkOrderStatusBadge';
import { PRIORITY_BADGE_CLASSES, getPriorityLabel, formatWorkOrderCost } from '../utils';
import type { WorkOrder, PaginatedResponse } from '../types';

interface WorkOrderTableProps {
  result: PaginatedResponse<WorkOrder> | undefined;
  isLoading: boolean;
  /**
   * ADDED. This table had a loading branch and no failure branch, so a failed
   * fetch fell through to the empty state — "No work orders found. Adjust your
   * filters, or a work order will appear here automatically the next time a
   * driver reports a defect." — which tells a workshop that nothing is
   * outstanding when in fact the work-order register could not be reached.
   * Telling a maintenance team there is no work waiting is how a critical
   * defect gets left on a vehicle, so the failure is now checked before the
   * empty case.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /**
   * Offered by the first-run empty state when the viewer may raise a work
   * order. The list page does not pass it yet because this module has no
   * manual create flow — work orders arrive from DVIR defects and maintenance
   * reminders — so the empty state simply omits the button.
   */
  onCreate?: () => void;
  /** Defaults to the page size the API reported, so existing callers need not pass it. */
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onView: (workOrder: WorkOrder) => void;
  onAssign: (workOrder: WorkOrder) => void;
  canAssign: boolean;
}

/** The three ways a work order can come into existence, as shown in the Source column. */
function sourceLabel(source: WorkOrder['source']): string {
  if (source === 'dvir') return 'Driver inspection';
  if (source === 'reminder') return 'Maintenance';
  return 'Manual';
}

export function WorkOrderTable({
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
}: WorkOrderTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<WorkOrder>[]>(
    () => [
      {
        accessorKey: 'license_plate',
        header: 'Vehicle',
        cell: ({ row }) => <span className="font-medium">{row.original.license_plate}</span>,
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => <span className="block truncate max-w-55">{row.original.title}</span>,
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => <Badge variant="outline">{sourceLabel(row.original.source)}</Badge>,
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
        cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'openedAt',
        header: 'Opened',
        cell: ({ row }) => formatDate(row.original.openedAt),
      },
      {
        accessorKey: 'totalCost',
        header: 'Total cost',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatWorkOrderCost(row.original.totalCost)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="block text-right">Actions</span>,
        cell: ({ row }) => {
          const workOrder = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => onView(workOrder)} title="View">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {canAssign && workOrder.status === 'open' && (
                <Button variant="ghost" size="icon" onClick={() => onAssign(workOrder)} title="Assign mechanic">
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

  // Two genuinely different empty states. "No work orders at all" is a
  // first-run moment that should explain what the workshop register is for and
  // offer to start it; "no work orders match these filters" is the operator
  // having hidden their own backlog, and the useful action there is to clear
  // the filters. The old single message covered both and helped with neither.
  const empty = hasFilters ? (
    <EmptyState
      icon={<ClipboardList aria-hidden="true" />}
      title="No work orders match these filters"
      description="Every work order in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<ClipboardList aria-hidden="true" />}
      title="No work orders raised yet"
      description="A work order is how a reported defect or a due service becomes assigned, tracked work. It is the link between what the Command Centre finds on a vehicle and what the workshop actually does about it."
      hints={[
        'Assign the job to a mechanic so it belongs to a named person, not the queue.',
        'Follow it through open, in progress, on hold and completed instead of chasing it verbally.',
        'Capture the parts and labour it consumed so a repair carries a real cost.',
      ]}
      action={onCreate ? { label: 'Raise a work order', onClick: onCreate } : undefined}
    />
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      // Kept as `isLoading && !result` rather than plain `isLoading`: the query
      // holds the previous page as placeholder data, and swapping a populated
      // table for a skeleton on every filter keystroke made the list flicker.
      isLoading={isLoading && !result}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      caption="Work orders"
      empty={empty}
      // Eight columns do not fit a phone. Below `lg` each work order renders as
      // a card carrying the fields that identify the job, with the title kept
      // actionable so it can still be opened without a wide screen.
      renderMobileRow={(workOrder) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onView(workOrder)}
              className="text-left text-body-sm font-medium text-primary hover:underline"
            >
              {workOrder.title}
            </button>
            <WorkOrderStatusBadge status={workOrder.status} />
          </div>
          <p className="text-caption text-muted-foreground">
            {workOrder.license_plate} · {getPriorityLabel(workOrder.priority)} priority ·{' '}
            {sourceLabel(workOrder.source)}
          </p>
          <p className="text-caption text-muted-foreground tabular-nums">
            Opened {formatDate(workOrder.openedAt)} · {formatWorkOrderCost(workOrder.totalCost)}
          </p>
          {canAssign && workOrder.status === 'open' && (
            <Button variant="outline" size="sm" onClick={() => onAssign(workOrder)}>
              <UserPlus className="h-3.5 w-3.5" />
              Assign mechanic
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
