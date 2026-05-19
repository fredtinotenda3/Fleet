// modules/expenses/components/ExpensesTable.tsx

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Expense } from '@/shared/types/expense.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Eye } from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';

interface ExpensesTableProps {
  data: Expense[];
  isLoading: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
  onView?: (expense: Expense) => void;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
}

export function ExpensesTable({ data, isLoading, pagination, onView, onEdit, onDelete }: ExpensesTableProps) {
  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: 'license_plate',
      header: 'Vehicle',
      cell: ({ row }) => (
        <span className="font-mono font-medium">{row.getValue('license_plate')}</span>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      accessorKey: 'expense_type',
      header: 'Type',
      cell: ({ row }) => {
        const expenseType = row.original.expense_type;
        return (
          <Badge variant="outline">
            {expenseType?.name || 'Other'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => formatCurrency(row.getValue('amount')),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const desc = row.getValue('description') as string;
        return desc ? <span className="truncate max-w-[200px]">{desc}</span> : '-';
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const expense = row.original;
        return (
          <div className="flex items-center gap-2">
            {onView && (
              <Button variant="ghost" size="sm" onClick={() => onView(expense)}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(expense)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(expense)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={onView}
      emptyMessage="No expenses found"
    />
  );
}