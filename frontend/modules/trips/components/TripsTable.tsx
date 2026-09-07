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
import { MoreHorizontal, Eye, Pencil, Trash2, Route } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Trip } from '../types';
import { tripModeLabel, getTripModeBadgeClass, tripSummaryLabel } from '../utils';
import { cn } from '@/lib/utils';

interface TripsTableProps {
  result: PaginatedResponse<Trip> | undefined;
  isLoading: boolean;
  /**
   * ADDED. The table had a loading branch and no failure branch, so a failed
   * fetch fell through to the empty message — "No trips found. Try adjusting
   * your filters or log a new trip." — which tells an operator that nothing
   * has been driven when in fact the trip log could not be reached. DataTable
   * now checks error before empty.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** Offered by the first-run empty state when the viewer may log a trip. */
  onCreate?: () => void;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
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

  // Two genuinely different empty states. "No trips at all" is a first-run
  // moment that should explain what the trip log unlocks and offer to start
  // it; "no trips match these filters" is the operator having hidden their own
  // journeys, and the useful action there is to clear the filters. The old
  // single message covered both cases and helped with neither.
  const empty = hasFilters ? (
    <EmptyState
      icon={<Route aria-hidden="true" />}
      title="No trips match these filters"
      description="Every journey in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Route aria-hidden="true" />}
      title="No journeys logged yet"
      description="Trips are the movement record of the fleet. Utilisation, distance travelled, driver-behaviour scoring and cost per km are all computed from them, so none of those figures exist until the first journey is logged."
      hints={[
        'See which vehicles are working and which are standing idle.',
        'Attribute distance to a driver to score how they drive.',
        'Divide fuel and maintenance spend by distance for true cost per km.',
      ]}
      action={onCreate ? { label: 'Log your first trip', onClick: onCreate } : undefined}
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
      caption="Trips"
      empty={empty}
      // Seven columns do not fit a phone. Below `lg` each trip renders as a
      // card carrying the fields that identify a journey, with the date kept
      // actionable so a trip can still be opened without a wide screen.
      renderMobileRow={(trip) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onView(trip)}
              className="text-body-sm font-medium text-primary hover:underline"
            >
              {formatDate(trip.date)}
            </button>
            <span className={cn('badge-status shrink-0', getTripModeBadgeClass(trip.mode))}>
              {tripModeLabel(trip.mode)}
            </span>
          </div>
          <p className="text-caption text-muted-foreground">
            {trip.license_plate} · {trip.driver_id || 'Unassigned'}
          </p>
          <p className="text-caption text-muted-foreground tabular-nums">
            {formatDistance(trip.distance_calculated)}
          </p>
          <p className="text-caption text-muted-foreground">{tripSummaryLabel(trip)}</p>
        </div>
      )}
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