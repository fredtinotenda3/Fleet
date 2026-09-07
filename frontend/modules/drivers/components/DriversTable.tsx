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
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { MoreHorizontal, Pencil, Trash2, AlertTriangle, Users } from 'lucide-react';
import type { Driver, DriverStatus } from '../types';

interface DriversTableProps {
  drivers: Driver[];
  isLoading: boolean;
  /**
   * ADDED. This table had a loading branch and no failure branch, so a failed
   * fetch rendered the empty message — "No drivers yet. Add your first driver
   * to start assigning trips and fuel logs." — telling an operator that nobody
   * is on the roster when in fact the driver register could not be reached.
   * DataTable checks error before empty, so the two can no longer be confused.
   * The drivers list page owns its own failure branch today; these props exist
   * so every consumer of this table gets the same ordering.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** True when a search term or status filter is applied, so the empty state can tell the two cases apart. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** Offered by the first-run empty state when the viewer may add a driver. */
  onCreate?: () => void;
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
  isError = false,
  errorMessage,
  onRetry,
  hasFilters = false,
  onClearFilters,
  onCreate,
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

  // Two genuinely different empty states. "No drivers at all" is a first-run
  // moment that should explain what the roster unlocks and offer to start it;
  // "no drivers match these filters" is the operator having hidden their own
  // people, and the useful action there is to clear the filters. The old
  // single message covered both and helped with neither.
  const empty = hasFilters ? (
    <EmptyState
      icon={<Users aria-hidden="true" />}
      title="No drivers match these filters"
      description="Every driver in your scope is currently filtered out."
      action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  ) : (
    <EmptyState
      icon={<Users aria-hidden="true" />}
      title="No drivers on the roster yet"
      description="Driver records are what make behaviour scoring, risk analysis and per-driver fuel accountability possible. Until a driver exists, every trip and every refuel in the platform is activity with no owner."
      hints={[
        'Score how each person actually drives, not just how the vehicle performed.',
        'Hold a named person to their fuel consumption instead of the fleet average.',
        'Surface a licence that is expiring before it puts an unlicensed driver on the road.',
      ]}
      action={onCreate ? { label: 'Add your first driver', onClick: onCreate } : undefined}
    />
  );

  return (
    <DataTable
      columns={columns}
      data={drivers}
      isLoading={isLoading}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      caption="Drivers"
      empty={empty}
      // Six columns do not fit a phone. Below `lg` each driver renders as a
      // card carrying the fields that identify the person and the one field
      // that can stop them driving — their licence expiry.
      renderMobileRow={(driver) => {
        const style = STATUS_STYLES[driver.status] ?? STATUS_STYLES.inactive;
        const expiry = licenceExpiryState(driver.license_expiry);
        return (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-body-sm font-medium text-foreground">{driver.name}</span>
              <Badge variant="outline" className={`${style.className} shrink-0`}>
                {style.label}
              </Badge>
            </div>
            {driver.driver_code && (
              <p className="text-caption text-muted-foreground">{driver.driver_code}</p>
            )}
            {(driver.email || driver.phone) && (
              <p className="text-caption text-muted-foreground">
                {[driver.email, driver.phone].filter(Boolean).join(' · ')}
              </p>
            )}
            <p
              className={
                expiry.tone === 'expired'
                  ? 'text-caption text-destructive'
                  : expiry.tone === 'warn'
                    ? 'text-caption text-warning'
                    : 'text-caption text-muted-foreground'
              }
            >
              Licence {driver.license_number || 'not recorded'} · {expiry.label}
            </p>
          </div>
        );
      }}
    />
  );
}

export default DriversTable;
