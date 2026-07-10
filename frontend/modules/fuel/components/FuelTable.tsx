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
import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelLog } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';

interface FuelTableProps {
  result: PaginatedResponse<FuelLog> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
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

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No fuel logs found. Try adjusting your filters or log a new fuel entry."
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