// frontend/modules/drivers/components/DriversTable.tsx

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
import { MoreHorizontal, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import type { Driver, DriverStatus } from '../types';

interface DriversTableProps {
  drivers: Driver[];
  isLoading: boolean;
  onEdit: (driver: Driver) => void;
  onDelete: (driver: Driver) => void;
  canManage: boolean;
}

const STATUS_STYLES: Record<DriverStatus, { className: string; label: string }> = {
  active: { className: 'border-success text-success', label: 'Active' },
  inactive: { className: 'text-muted-foreground', label: 'Inactive' },
  suspended: { className: 'border-destructive text-destructive', label: 'Suspended' },
};

/** Days before expiry at which a licence is surfaced as expiring soon. */
const LICENCE_WARNING_DAYS = 30;

function licenceExpiryState(expiry?: Date | string): {
  label: string;
  tone: 'ok' | 'warn' | 'expired' | 'none';
} {
  if (!expiry) return { label: 'Not recorded', tone: 'none' };

  const date = expiry instanceof Date ? expiry : new Date(expiry);
  if (Number.isNaN(date.getTime())) return { label: 'Not recorded', tone: 'none' };

  const formatted = date.toLocaleDateString();
  const daysRemaining = Math.ceil((date.getTime() - Date.now()) / 86_400_000);

  if (daysRemaining < 0) return { label: `${formatted} — expired`, tone: 'expired' };
  if (daysRemaining <= LICENCE_WARNING_DAYS) {
    return { label: `${formatted} — ${daysRemaining}d left`, tone: 'warn' };
  }
  return { label: formatted, tone: 'ok' };
}

export function DriversTable({
  drivers,
  isLoading,
  onEdit,
  onDelete,
  canManage,
}: DriversTableProps) {
  const columns = useMemo<ColumnDef<Driver>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Driver',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            {row.original.driver_code ? (
              <span className="text-xs text-muted-foreground">{row.original.driver_code}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => {
          const { email, phone } = row.original;
          if (!email && !phone) return <span className="text-muted-foreground">N/A</span>;
          return (
            <div className="flex flex-col text-sm">
              {email ? <span>{email}</span> : null}
              {phone ? <span className="text-muted-foreground">{phone}</span> : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'license_number',
        header: 'Licence',
        cell: ({ row }) => row.original.license_number || <span className="text-muted-foreground">N/A</span>,
      },
      {
        accessorKey: 'license_expiry',
        header: 'Licence expiry',
        cell: ({ row }) => {
          const state = licenceExpiryState(row.original.license_expiry);
          if (state.tone === 'none') {
            return <span className="text-muted-foreground">{state.label}</span>;
          }
          if (state.tone === 'ok') return <span>{state.label}</span>;
          return (
            <span
              className={
                state.tone === 'expired'
                  ? 'flex items-center gap-1 text-destructive'
                  : 'flex items-center gap-1 text-warning'
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {state.label}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const style = STATUS_STYLES[row.original.status] ?? STATUS_STYLES.inactive;
          return (
            <Badge variant="outline" className={style.className}>
              {style.label}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          if (!canManage) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(row.original)}
                  className="text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canManage, onEdit, onDelete]
  );

  return (
    <DataTable
      columns={columns}
      data={drivers}
      isLoading={isLoading}
      emptyMessage="No drivers yet. Add your first driver to start assigning trips and fuel logs."
    />
  );
}

export default DriversTable;
