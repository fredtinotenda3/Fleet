'use client';

import { useMemo } from 'react';
import Link from 'next/link';
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
import { MoreHorizontal, Eye, Pencil, Copy, Trash2, Wrench, CheckCircle2, PauseCircle } from 'lucide-react';
import { formatDistance } from '@/shared/utils/distance.utils';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Truck } from 'lucide-react';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Vehicle, VehicleStatus } from '../types';
import { getVehicleStatusMeta, getVehicleStatusBadgeClass } from '../utils';
import { cn } from '@/lib/utils';

interface VehiclesTableProps {
  result: PaginatedResponse<Vehicle> | undefined;
  isLoading: boolean;
  /**
   * ADDED. Without this the table rendered its empty message on a failed
   * fetch — telling an operator "No vehicles found. Try adjusting your
   * filters or add a new vehicle." while the fleet register was simply
   * unreachable. DataTable now checks error before empty.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** Offered by the first-run empty state when the viewer may add a vehicle. */
  onAddVehicle?: () => void;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  onDuplicate: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
  onStatusChange: (vehicle: Vehicle, status: VehicleStatus) => void;
  canManage: boolean;
  canDelete: boolean;
}

export function VehiclesTable({
  result,
  isLoading,
  isError = false,
  errorMessage,
  onRetry,
  hasFilters = false,
  onClearFilters,
  onAddVehicle,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  canManage,
  canDelete,
}: VehiclesTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<Vehicle>[]>(() => {
    const cols: ColumnDef<Vehicle>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((v) => selectedIds.has(v._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((v) => v._id!))}
            aria-label="Select all vehicles on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select ${row.original.license_plate}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'license_plate',
        header: 'License plate',
        cell: ({ row }) => (
          <Link href={`/vehicles/${row.original._id}`} className="font-medium text-primary hover:underline">
            {row.original.license_plate}
          </Link>
        ),
      },
      {
        id: 'make_model',
        header: 'Make & model',
        cell: ({ row }) => (
          <span>
            {row.original.make} {row.original.model}
          </span>
        ),
      },
      { accessorKey: 'year', header: 'Year' },
      { accessorKey: 'vehicle_type', header: 'Type' },
      { accessorKey: 'fuel_type', header: 'Fuel' },
      {
        accessorKey: 'odometer',
        header: 'Odometer',
        cell: ({ row }) => (row.original.odometer != null ? formatDistance(row.original.odometer) : 'N/A'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className={cn('badge-status', getVehicleStatusBadgeClass(row.original.status as VehicleStatus))}>
            {getVehicleStatusMeta(row.original.status).label}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const vehicle = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Vehicle actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(vehicle)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(vehicle)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onSelect={() => onDuplicate(vehicle)}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                  </DropdownMenuItem>
                )}
                {canManage && <DropdownMenuSeparator />}
                {canManage && vehicle.status !== 'active' && (
                  <DropdownMenuItem onSelect={() => onStatusChange(vehicle, 'active')}>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark active
                  </DropdownMenuItem>
                )}
                {canManage && vehicle.status !== 'maintenance' && (
                  <DropdownMenuItem onSelect={() => onStatusChange(vehicle, 'maintenance')}>
                    <Wrench className="mr-2 h-3.5 w-3.5" /> Send to maintenance
                  </DropdownMenuItem>
                )}
                {canManage && vehicle.status !== 'inactive' && (
                  <DropdownMenuItem onSelect={() => onStatusChange(vehicle, 'inactive')}>
                    <PauseCircle className="mr-2 h-3.5 w-3.5" /> Mark inactive
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(vehicle)} className="text-destructive">
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
  }, [data, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDuplicate, onDelete, onStatusChange, canManage, canDelete]);

  // Two genuinely different empty states. "No vehicles at all" is a
  // first-run moment that should explain what the register unlocks and offer
  // to start it; "no vehicles match these filters" is the user having hidden
  // their own fleet, and the useful action there is to clear the filters.
  const empty = hasFilters ? (
    <EmptyState
      icon={<Truck aria-hidden="true" />}
      title="No vehicles match these filters"
      description="Every vehicle in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Truck aria-hidden="true" />}
      title="Your fleet is ready to be configured"
      description="Vehicles are the spine of the platform. Everything else — fuel, maintenance, trips, cost per km and every alert — attaches to one."
      hints={[
        'Track service intervals and get warned before something is overdue.',
        'Attribute fuel and expenses per vehicle to see true cost per km.',
        'Map a telematics tracker to a vehicle to put it on the live map.',
      ]}
      action={onAddVehicle ? { label: 'Add your first vehicle', onClick: onAddVehicle } : undefined}
      secondaryAction={{ label: 'Connect telematics', href: '/telematics/trackers' }}
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
      caption="Vehicles"
      empty={empty}
      // Nine columns do not fit a phone. Below `lg` each vehicle renders as a
      // card carrying the four fields that actually identify it.
      renderMobileRow={(vehicle) => {
        // Same cast the status column above uses: Vehicle.status is the
        // broader shared `Status` union, of which VehicleStatus is the subset
        // these helpers cover.
        const status = vehicle.status as VehicleStatus;
        return (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-body-sm font-medium text-foreground">{vehicle.license_plate}</span>
              <span className={cn('badge-status shrink-0', getVehicleStatusBadgeClass(status))}>
                {getVehicleStatusMeta(status).label}
              </span>
            </div>
            <p className="text-caption text-muted-foreground">
              {vehicle.make} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
            {vehicle.odometer !== undefined && vehicle.odometer !== null && (
              <p className="text-caption text-muted-foreground tabular-nums">
                {formatDistance(vehicle.odometer)}
              </p>
            )}
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