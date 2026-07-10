// frontend/modules/fuel-cards/components/FuelCardsTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { FuelCard } from '../types';

interface FuelCardsTableProps {
  cards: FuelCard[];
  isLoading: boolean;
  onEdit: (card: FuelCard) => void;
  onDelete: (card: FuelCard) => void;
  canManage: boolean;
}

const STATUS_VARIANT: Record<string, 'outline'> = { active: 'outline', suspended: 'outline', expired: 'outline' };
const STATUS_CLASS: Record<string, string> = {
  active: 'border-success text-success',
  suspended: 'border-warning text-warning',
  expired: 'border-destructive text-destructive',
};

export function FuelCardsTable({ cards, isLoading, onEdit, onDelete, canManage }: FuelCardsTableProps) {
  const columns = useMemo<ColumnDef<FuelCard>[]>(
    () => [
      { accessorKey: 'provider', header: 'Provider' },
      { id: 'card', header: 'Card', cell: ({ row }) => `•••• ${row.original.card_last4}` },
      { accessorKey: 'license_plate', header: 'Assigned vehicle', cell: ({ row }) => row.original.license_plate || 'Unassigned' },
      {
        accessorKey: 'monthly_limit',
        header: 'Monthly limit',
        cell: ({ row }) =>
          row.original.monthly_limit != null
            ? formatCurrency(row.original.monthly_limit, { currency: row.original.currency })
            : 'N/A',
      },
      {
        accessorKey: 'expiry_date',
        header: 'Expiry',
        cell: ({ row }) => (row.original.expiry_date ? formatDate(row.original.expiry_date) : 'N/A'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className={`capitalize ${STATUS_CLASS[row.original.status]}`}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const card = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Card actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(card)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(card)} className="text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [onEdit, onDelete, canManage]
  );

  return (
    <DataTable
      columns={columns}
      data={cards}
      isLoading={isLoading}
      emptyMessage="No fuel cards registered yet."
    />
  );
}