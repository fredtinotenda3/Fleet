// frontend/modules/fuel-stations/components/FuelStationsTable.tsx

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
import type { FuelStation } from '../types';

interface FuelStationsTableProps {
  stations: FuelStation[];
  isLoading: boolean;
  onEdit: (station: FuelStation) => void;
  onDelete: (station: FuelStation) => void;
  canManage: boolean;
}

export function FuelStationsTable({ stations, isLoading, onEdit, onDelete, canManage }: FuelStationsTableProps) {
  const columns = useMemo<ColumnDef<FuelStation>[]>(
    () => [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'brand', header: 'Brand', cell: ({ row }) => row.original.brand || 'N/A' },
      {
        id: 'location',
        header: 'Location',
        cell: ({ row }) => [row.original.city, row.original.country].filter(Boolean).join(', ') || 'N/A',
      },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || 'N/A' },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline" className="border-success text-success">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const station = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Station actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(station)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(station)} className="text-destructive">
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
      data={stations}
      isLoading={isLoading}
      emptyMessage="No fuel stations registered yet."
    />
  );
}