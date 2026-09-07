// frontend/modules/maintenance/components/MaintenanceTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Trash2, CheckCircle2, Wrench } from 'lucide-react';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import {
  STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  getStatusLabel,
  getPriorityLabel,
  formatEstimatedCost,
  isRecordOverdue,
} from '../utils';
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory } from '../types';
import type { Reminder, PaginatedResponse } from '../types';

interface MaintenanceTableProps {
  result: PaginatedResponse<Reminder> | undefined;
  isLoading: boolean;
  /**
   * ADDED. This table had a loading branch and no failure branch, so a failed
   * fetch rendered the empty state — "No maintenance records found. Adjust
   * your filters or create a new maintenance record to get started." — which
   * tells an operator that nothing is due when in fact the service register
   * could not be reached. In a maintenance module that is the most damaging
   * possible lie, so the failure is now checked before the empty case.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** Offered by the first-run empty state when the viewer may add a record. */
  onCreate?: () => void;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (record: Reminder) => void;
  onEdit: (record: Reminder) => void;
  onDelete: (record: Reminder) => void;
  onComplete: (record: Reminder) => void;
  canManage: boolean;
  canDelete: boolean;
  canComplete: boolean;
}

export function MaintenanceTable({
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
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  onComplete,
  canManage,
  canDelete,
  canComplete,
}: MaintenanceTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<Reminder>[]>(() => {
    const cols: ColumnDef<Reminder>[] = [];

    if (canDelete) {
      // `_id` is optional on Reminder because BaseEntity allows a not-yet-persisted
      // entity, but every record rendered here came back from the API and has one.
      const allSelected = data.length > 0 && data.every((r) => selectedIds.has(r._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((r) => r._id!))}
            aria-label="Select all maintenance records on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select ${row.original.title}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'license_plate',
        header: 'Vehicle',
        cell: ({ row }) => <span className="font-medium">{row.original.license_plate}</span>,
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => <span className="block max-w-55 truncate">{row.original.title}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) =>
          row.original.category
            ? MAINTENANCE_CATEGORY_LABELS[row.original.category as MaintenanceCategory] ?? row.original.category
            : '—',
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
        cell: ({ row }) => {
          // A record whose due date has passed still carries status 'pending' in
          // the database, so the displayed status is derived rather than read.
          const overdue = isRecordOverdue(row.original);
          return (
            <Badge className={STATUS_BADGE_CLASSES[overdue ? 'overdue' : row.original.status]}>
              {getStatusLabel(overdue ? 'overdue' : row.original.status)}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'due_date',
        header: 'Due date',
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: 'estimated_cost',
        header: 'Est. cost',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatEstimatedCost(row.original.estimated_cost)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="block text-right">Actions</span>,
        cell: ({ row }) => {
          const record = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => onView(record)} title="View">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {canManage && (
                <Button variant="ghost" size="icon" onClick={() => onEdit(record)} title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {canComplete && record.status !== 'completed' && (
                <Button variant="ghost" size="icon" onClick={() => onComplete(record)} title="Mark complete">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                </Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon" onClick={() => onDelete(record)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          );
        },
      }
    );

    return cols;
  }, [
    data,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onView,
    onEdit,
    onDelete,
    onComplete,
    canManage,
    canDelete,
    canComplete,
  ]);

  // Two genuinely different empty states. "No service records at all" is a
  // first-run moment that should explain what the register unlocks and offer
  // to start it; "no records match these filters" is the operator having
  // hidden their own schedule, and the useful action there is to clear the
  // filters. The old single message covered both and helped with neither.
  const empty = hasFilters ? (
    <EmptyState
      icon={<Wrench aria-hidden="true" />}
      title="No maintenance records match these filters"
      description="Every service record in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Wrench aria-hidden="true" />}
      title="No service history recorded yet"
      description="Service records are what the rest of the maintenance module is built on. Upcoming and overdue service, vehicle health and every predictive-maintenance projection are computed from them, so none of that intelligence exists until the first record is logged."
      hints={[
        'Get warned before a service falls due instead of after it is missed.',
        'Judge the health of a vehicle from its own repair and service history.',
        'Let the platform predict the next failure from what has already broken.',
      ]}
      action={onCreate ? { label: 'Add your first record', onClick: onCreate } : undefined}
    />
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      caption="Maintenance records"
      empty={empty}
      // An overdue record is the one thing on this page that must be visible
      // at a glance, so the whole row stays tinted rather than relying on the
      // status badge alone.
      rowClassName={(record) => (isRecordOverdue(record) ? 'bg-danger-bg' : undefined)}
      // Nine columns do not fit a phone. Below `lg` each record renders as a
      // card carrying the fields that identify it, with the title kept
      // actionable so a record can still be opened without a wide screen.
      renderMobileRow={(record) => {
        const overdue = isRecordOverdue(record);
        return (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onView(record)}
                className="text-left text-body-sm font-medium text-primary hover:underline"
              >
                {record.title}
              </button>
              <Badge className={`${STATUS_BADGE_CLASSES[overdue ? 'overdue' : record.status]} shrink-0`}>
                {getStatusLabel(overdue ? 'overdue' : record.status)}
              </Badge>
            </div>
            <p className="text-caption text-muted-foreground">
              {record.license_plate} · {getPriorityLabel(record.priority)} priority
            </p>
            <p className="text-caption text-muted-foreground tabular-nums">
              Due {formatDate(record.due_date)} · {formatEstimatedCost(record.estimated_cost)}
            </p>
          </div>
        );
      }}
      pagination={
        result
          ? {
              page: result.pagination.page,
              pageSize,
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
