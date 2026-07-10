
// frontend/modules/expenses/components/ExpensesTable.tsx

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
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Expense } from '../types';
import { expenseCategoryLabel, formatExpenseAmount } from '../utils';

interface ExpensesTableProps {
  result: PaginatedResponse<Expense> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  canManage: boolean;
  canDelete: boolean;
  hideVehicleColumn?: boolean;
}

export function ExpensesTable({
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
  hideVehicleColumn = false,
}: ExpensesTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<Expense>[]>(() => {
    const cols: ColumnDef<Expense>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((e) => selectedIds.has(e._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((e) => e._id!))}
            aria-label="Select all expenses on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select expense on ${row.original.date}`}
          />
        ),
      });
    }

    cols.push({
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <button type="button" onClick={() => onView(row.original)} className="font-medium text-primary hover:underline">
          {formatDate(row.original.date)}
        </button>
      ),
    });

    if (!hideVehicleColumn) {
      cols.push({ accessorKey: 'license_plate', header: 'Vehicle' });
    }

    cols.push(
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => <Badge variant="outline">{expenseCategoryLabel(row.original)}</Badge>,
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => <span className="tabular-nums">{formatExpenseAmount(row.original.amount)}</span>,
      },
      {
        accessorKey: 'jobTrip',
        header: 'Job / Trip',
        cell: ({ row }) => row.original.jobTrip || 'N/A',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className="block truncate max-w-55">{row.original.description || 'N/A'}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const expense = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Expense actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(expense)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(expense)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(expense)} className="text-destructive">
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
  }, [data, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDelete, canManage, canDelete, hideVehicleColumn]);

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No expenses found. Try adjusting your filters or record a new expense."
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