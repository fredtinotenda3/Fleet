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

/**
 * Deterministic category -> chart-color mapping so the same category
 * always renders with the same accent (stable across pages/sessions,
 * unlike random colors), reusing the six palette slots already defined
 * as --chart-1..6 in app/globals.css. "Uncategorized" always gets the
 * neutral/muted treatment rather than a color slot, so it visually
 * reads as "no category" instead of just another category.
 */
const CHART_COLOR_COUNT = 6;

function categoryColorIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return (hash % CHART_COLOR_COUNT) + 1;
}

function CategoryBadge({ expense }: { expense: Expense }) {
  const label = expenseCategoryLabel(expense);

  if (label === 'Uncategorized') {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        {label}
      </Badge>
    );
  }

  const colorIndex = categoryColorIndex(label);
  return (
    <Badge
      variant="outline"
      className="border-transparent"
      style={{
        backgroundColor: `color-mix(in oklab, var(--chart-${colorIndex}) 14%, transparent)`,
        color: `var(--chart-${colorIndex})`,
      }}
    >
      {label}
    </Badge>
  );
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
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="font-medium transition-colors text-primary hover:text-primary/80 hover:underline"
        >
          {formatDate(row.original.date)}
        </button>
      ),
    });

    if (!hideVehicleColumn) {
      cols.push({
        accessorKey: 'license_plate',
        header: 'Vehicle',
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-foreground">{row.original.license_plate}</span>
        ),
      });
    }

    cols.push(
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => <CategoryBadge expense={row.original} />,
      },
      {
        accessorKey: 'amount',
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) => (
          <span className="block font-medium text-right tabular-nums text-foreground">
            {formatExpenseAmount(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'jobTrip',
        header: 'Job / Trip',
        cell: ({ row }) =>
          row.original.jobTrip ? (
            <span className="text-foreground">{row.original.jobTrip}</span>
          ) : (
            <span className="text-muted-foreground">N/A</span>
          ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) =>
          row.original.description ? (
            <span className="block truncate max-w-55 text-foreground" title={row.original.description}>
              {row.original.description}
            </span>
          ) : (
            <span className="text-muted-foreground">N/A</span>
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