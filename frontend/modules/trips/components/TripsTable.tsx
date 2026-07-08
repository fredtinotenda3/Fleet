// frontend/modules/trips/components/TripsTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Trip } from '../types';
import { tripModeLabel, getTripModeBadgeClass, tripSummaryLabel } from '../utils';
import { cn } from '@/lib/utils';

interface TripsTableProps {
  result: PaginatedResponse<Trip> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (trip: Trip) => void;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
  canManage: boolean;
  canDelete: boolean;
}

export function TripsTable({
  result,
  isLoading,
  pageSize,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  canManage,
  canDelete,
}: TripsTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<Trip>[]>(() => {
    const cols: ColumnDef<Trip>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((t) => selectedIds.has(t._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((t) => t._id!))}
            aria-label="Select all trips on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select trip on ${row.original.license_plate}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="font-medium text-primary hover:underline"
          >
            {formatDate(row.original.date)}
          </button>
        ),
      },
      { accessorKey: 'license_plate', header: 'Vehicle' },
      {
        accessorKey: 'mode',
        header: 'Mode',
        cell: ({ row }) => (
          <span className={cn('badge-status', getTripModeBadgeClass(row.original.mode))}>
            {tripModeLabel(row.original.mode)}
          </span>
        ),
      },
      {
        accessorKey: 'distance_calculated',
        header: 'Distance',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDistance(row.original.distance_calculated)}</span>
        ),
      },
      {
        id: 'route',
        header: 'Route',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{tripSummaryLabel(row.original)}</span>
        ),
      },
      {
        accessorKey: 'driver_id',
        header: 'Driver',
        cell: ({ row }) => row.original.driver_id || 'Unassigned',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const trip = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Trip actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(trip)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(trip)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(trip)} className="text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }
    );

    return cols;
  }, [data, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDelete, canManage, canDelete]);

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No trips found. Try adjusting your filters or log a new trip."
      pagination={
        result
          ? {
              page: result.pagination.page,
              pageSize,
              total: result.pagination.total,
              totalPages: result.pagination.totalPages,
              onPageChange,
            }
          : undefined
      }
    />
  );
}