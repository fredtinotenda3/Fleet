// frontend/modules/fuel/components/FuelTable.tsx

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
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { MoreHorizontal, Eye, Pencil, Trash2, Fuel } from 'lucide-react';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelLog } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';

interface FuelTableProps {
  result: PaginatedResponse<FuelLog> | undefined;
  isLoading: boolean;
  /**
   * ADDED. The table had a loading branch but no failure branch, so a failed
   * fetch fell through to the empty message — "No fuel logs found. Try
   * adjusting your filters or log a new fuel entry." — which tells an
   * operator their fuel history is empty while the API is simply down. That
   * is the worst possible reading of an outage on this particular list,
   * because an empty fuel history is also what fuel theft looks like.
   * DataTable now checks error before empty.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when any filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** Offered by the first-run empty state when the viewer may log fuel. */
  onCreate?: () => void;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (log: FuelLog) => void;
  onEdit: (log: FuelLog) => void;
  onDelete: (log: FuelLog) => void;
  canManage: boolean;
  canDelete: boolean;
}

const PAYMENT_BADGE_VARIANT: Record<string, 'outline' | 'secondary'> = {
  cash: 'secondary',
  fuel_card: 'outline',
  credit_card: 'outline',
  company_account: 'outline',
  other: 'outline',
};

export function FuelTable({
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
}: FuelTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<FuelLog>[]>(() => {
    const cols: ColumnDef<FuelLog>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((log) => selectedIds.has(log._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((log) => log._id!))}
            aria-label="Select all fuel entries on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select entry for ${row.original.license_plate}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <button type="button" onClick={() => onView(row.original)} className="font-medium text-primary hover:underline">
            {formatDate(row.original.date)}
          </button>
        ),
      },
      { accessorKey: 'license_plate', header: 'Vehicle' },
      {
        // NEW: Driver column. Shows "Unassigned" (muted) for legacy or
        // driver-less records rather than a blank cell, so it reads as
        // an intentional state, not missing data.
        id: 'driver',
        header: 'Driver',
        cell: ({ row }) =>
          row.original.driver?.name ? (
            <span>{row.original.driver.name}</span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        accessorKey: 'fuel_volume',
        header: 'Volume',
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.fuel_volume} {row.original.unit?.symbol ?? 'L'}</span>
        ),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCurrency(row.original.cost, { currency: row.original.currency || 'USD' })}</span>
        ),
      },
      {
        accessorKey: 'payment_method',
        header: 'Payment',
        cell: ({ row }) => {
          const method = row.original.payment_method ?? 'cash';
          return (
            <Badge variant={PAYMENT_BADGE_VARIANT[method] ?? 'outline'}>
              {PAYMENT_METHOD_LABELS[method]}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'odometer',
        header: 'Odometer',
        cell: ({ row }) => (row.original.odometer != null ? row.original.odometer.toLocaleString() : 'N/A'),
      },
      {
        accessorKey: 'station_name',
        header: 'Station',
        cell: ({ row }) => row.original.fuel_station?.name || row.original.station_name || 'N/A',
      },
      {
        accessorKey: 'is_full_tank',
        header: 'Full tank',
        cell: ({ row }) =>
          row.original.is_full_tank ? (
            <Badge variant="outline" className="border-success text-success">Yes</Badge>
          ) : (
            <span className="text-muted-foreground">No</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const log = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Fuel entry actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(log)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(log)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(log)} className="text-destructive">
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

  // Two genuinely different empty states behind one old message. "No fuel
  // logs at all" is a first-run moment worth explaining, because fuel logs
  // are an input the platform cannot derive for itself; "no logs match these
  // filters" is the user having hidden their own data, and the only useful
  // action there is to undo the filters.
  const empty = hasFilters ? (
    <EmptyState
      icon={<Fuel aria-hidden="true" />}
      title="No fuel logs match these filters"
      description="Every fuel entry in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Fuel aria-hidden="true" />}
      title="Start logging fuel to see how your fleet actually burns it"
      description="Fuel logs are the raw input the platform reasons over. Consumption, cost per litre, abnormal-usage detection and fuel-fraud intelligence are all computed from these entries — none of them can be inferred without them."
      hints={[
        'Track litres per 100 km per vehicle instead of a single fleet-wide total.',
        'Get flagged when a vehicle drifts away from its own consumption baseline.',
        'Compare pump volume against card, station and odometer to surface fuel fraud.',
      ]}
      action={onCreate ? { label: 'Log your first fuel entry', onClick: onCreate } : undefined}
      // No secondary action here on purpose. The obvious candidate would be
      // an "Import fuel data" link, but /fuel/logs IS this page — pointing an
      // empty state back at itself is worse than offering nothing. Import
      // lives in a modal on this page's header, which the operator can
      // already see above this table.
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
      caption="Fuel logs"
      empty={empty}
      // Ten columns are unusable on a phone. Below `lg` each entry collapses
      // to the four fields that identify a fuel purchase: which vehicle, when,
      // how much fuel, and what it cost.
      renderMobileRow={(log) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-body-sm font-medium text-foreground">{log.license_plate}</span>
            <span className="shrink-0 text-body-sm font-medium tabular-nums text-foreground">
              {formatCurrency(log.cost, { currency: log.currency || 'USD' })}
            </span>
          </div>
          <p className="text-caption text-muted-foreground">
            {formatDate(log.date)} ·{' '}
            <span className="tabular-nums">
              {log.fuel_volume} {log.unit?.symbol ?? 'L'}
            </span>
          </p>
          <p className="text-caption text-muted-foreground">
            {log.driver?.name ?? 'Unassigned'}
            {log.fuel_station?.name || log.station_name
              ? ` · ${log.fuel_station?.name || log.station_name}`
              : ''}
          </p>
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