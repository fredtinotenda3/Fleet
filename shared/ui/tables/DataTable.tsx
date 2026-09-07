// shared/ui/tables/DataTable.tsx

'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  useReactTable,
  OnChangeFn,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { ErrorState } from '@/frontend/shared/ui/patterns/ErrorState';
import { cn } from '@/lib/utils';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  /**
   * ADDED. The table previously had no failure branch: when a fetch failed,
   * callers passed `data={[]}` and the table rendered `emptyMessage` —
   * "No vehicles found. Try adjusting your filters or add a new vehicle." —
   * which tells an operator their fleet is empty during an outage. Error is
   * now checked BEFORE empty, and the two are visually distinct.
   */
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    /**
     * Was declared here and never referenced in the body, so passing it did
     * nothing. Now wired to a real page-size control, which only renders
     * when this callback is supplied.
     */
    onPageSizeChange?: (pageSize: number) => void;
  };
  sorting?: {
    state: SortingState;
    onSortingChange: OnChangeFn<SortingState>;
  };
  onRowClick?: (row: TData) => void;
  /** Plain-text fallback. Prefer `empty` for anything a user should act on. */
  emptyMessage?: string;
  /**
   * ADDED. A full `EmptyState` (icon, explanation, call to action) rendered
   * in place of the one-line `emptyMessage`. Takes precedence when supplied.
   */
  empty?: React.ReactNode;
  /**
   * ADDED. Rendered instead of the table on small screens. A 9-column fleet
   * table is unusable on a phone; without this the page just scrolls
   * sideways. Supply a card renderer and the table swaps below `lg`.
   */
  renderMobileRow?: (row: TData) => React.ReactNode;
  /**
   * ADDED. Per-row styling hook, for the tables where the row itself carries
   * a meaning no single cell owns — the maintenance list tints an overdue
   * record's entire row red, and that whole-row warning would have been lost
   * when it moved onto this shared table.
   */
  rowClassName?: (row: TData) => string | undefined;
  /** Accessible name for the table. Strongly recommended. */
  caption?: string;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTable<TData, TValue>({
  columns,
  data = [],
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  pagination,
  sorting,
  onRowClick,
  emptyMessage = 'No records to show',
  empty,
  renderMobileRow,
  rowClassName,
  caption,
  className,
}: DataTableProps<TData, TValue>) {
  const safeData = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const table = useReactTable({
    data: safeData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: sorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: sorting?.onSortingChange,
    state: { sorting: sorting?.state },
    manualPagination: !!pagination,
    pageCount: pagination?.totalPages,
  });

  if (isLoading) {
    return (
      <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((_, index) => (
                <TableHead key={index}>
                  <Skeleton className="h-3.5 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-3.5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Ordered ahead of the empty branch deliberately — see `isError` above.
  if (isError) {
    return (
      <ErrorState
        title="This list didn't load"
        description="The records could not be fetched. This does not mean there are none."
        detail={errorMessage}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  const rows = table.getRowModel().rows;
  const hasRows = rows.length > 0;

  if (!hasRows && empty) {
    return (
      <div className={cn('rounded-lg border border-border bg-card', className)}>{empty}</div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Desktop / tablet: the real table. `overflow-x-auto` keeps a wide
          table scrolling inside its own container rather than pushing the
          page body sideways. */}
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card',
          renderMobileRow && 'hidden lg:block'
        )}
      >
        <div className="overflow-x-auto">
          <Table>
            {caption && <caption className="sr-only">{caption}</caption>}
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-caption font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {hasRows ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    // A click handler on a <tr> is not reachable by keyboard.
                    // Making the row focusable and Enter-activatable is the
                    // minimum that keeps these tables operable without a
                    // mouse (WCAG 2.1.1).
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row.original);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      'text-body-sm',
                      onRowClick && 'cursor-pointer hover:bg-muted/50',
                      rowClassName?.(row.original)
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="h-24 text-center text-body-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile: a stacked card per record, when the caller supplies one. */}
      {renderMobileRow && (
        <div className="space-y-2 lg:hidden">
          {hasRows ? (
            rows.map((row) => (
              <div
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                onKeyDown={
                  onRowClick
                    ? (event: React.KeyboardEvent<HTMLDivElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row.original);
                        }
                      }
                    : undefined
                }
                className={cn(
                  'rounded-lg border border-border bg-card p-3 shadow-xs',
                  onRowClick && 'cursor-pointer transition-colors hover:border-primary/40',
                  rowClassName?.(row.original)
                )}
              >
                {renderMobileRow(row.original)}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-body-sm text-muted-foreground">
              {emptyMessage}
            </p>
          )}
        </div>
      )}

      {pagination && pagination.totalPages > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-muted-foreground tabular-nums">
            Showing {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total.toLocaleString()}
          </p>

          <div className="flex items-center gap-3">
            {pagination.onPageSizeChange && (
              <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pagination.pageSize}
                  onChange={(event) => pagination.onPageSizeChange?.(Number(event.target.value))}
                  className="h-7 rounded-md border border-input bg-surface px-1.5 text-caption text-foreground"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="First page"
                onClick={() => pagination.onPageChange(1)}
                disabled={pagination.page <= 1}
              >
                <ChevronsLeft className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </Button>
              <span className="px-2 text-caption font-medium tabular-nums whitespace-nowrap">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Last page"
                onClick={() => pagination.onPageChange(pagination.totalPages)}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronsRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
