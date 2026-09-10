// frontend/modules/vehicles/components/operations/VehicleActivityTimeline.tsx
//
// The Activity tab, rebuilt.
//
// ---------------------------------------------------------------------
// WHAT IT REPLACED
// ---------------------------------------------------------------------
// The tab rendered the AUDIT LOG and nothing else -- `/api/security/
// audit-log?entityType=vehicle&entityId=...`. So a truck that had been
// refuelled eleven times, serviced twice and driven for six months read:
//
//     Vehicle updated      12 Mar 2026 09:14
//     Vehicle created      02 Jan 2026 11:02
//
// Technically an activity history. Not the vehicle's activity, and not
// what anybody opens the tab for.
//
// It now merges the vehicle's own operational records -- fuel, expenses,
// trips, maintenance, work orders -- with the audit log, newest first,
// with the record changes still visible but marked as what they are.
//
// ---------------------------------------------------------------------
// TWO RULES IT HOLDS TO
// ---------------------------------------------------------------------
//  1. NOTHING IS FABRICATED. Only records the API returned appear. A
//     record with no usable date is excluded and COUNTED, and the count
//     is shown -- see buildVehicleTimeline for why dating it to "now" or
//     to the epoch are both worse.
//  2. A FAILED FETCH IS NOT AN EMPTY HISTORY. If any source errors, the
//     panel says which one and offers a retry, instead of rendering a
//     shorter list that looks complete. This is the same defect the
//     UI/UX round found on six list pages, where a failed fetch fell
//     through to "No records found."

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Fuel,
  History,
  Receipt,
  RefreshCw,
  Route,
  Wrench,
  AlertTriangle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import { cn } from '@/lib/utils';

import { useVehicleFuelHistory } from '@/frontend/modules/fuel/hooks/useFuel';
import { useVehicleExpenseHistory } from '@/frontend/modules/expenses/hooks/useExpenses';
import { useTripsList } from '@/frontend/modules/trips/hooks/useTrips';
import { useVehicleMaintenanceHistory } from '@/frontend/modules/maintenance/hooks/useMaintenance';
import { useWorkOrderList } from '@/frontend/modules/workorders/hooks/useWorkOrders';

import { useVehicleActivity } from '../../hooks/useVehicles';
import {
  buildVehicleTimeline,
  TIMELINE_KIND_LABELS,
  type VehicleTimelineKind,
} from '../../utils/vehicle-timeline';

const KIND_ICON: Record<VehicleTimelineKind, React.ReactNode> = {
  fuel: <Fuel className="size-4" aria-hidden="true" />,
  expense: <Receipt className="size-4" aria-hidden="true" />,
  trip: <Route className="size-4" aria-hidden="true" />,
  maintenance: <Wrench className="size-4" aria-hidden="true" />,
  'work-order': <ClipboardList className="size-4" aria-hidden="true" />,
  audit: <History className="size-4" aria-hidden="true" />,
};

const KIND_TONE: Record<VehicleTimelineKind, string> = {
  fuel: 'text-primary',
  expense: 'text-primary',
  trip: 'text-primary',
  maintenance: 'text-warning',
  'work-order': 'text-warning',
  // Record changes are deliberately muted: they are context, not the
  // fleet's activity, and giving them equal weight is what made the old
  // tab read as noise.
  audit: 'text-muted-foreground',
};

const PER_SOURCE_LIMIT = 25;

interface VehicleActivityTimelineProps {
  vehicleId: string;
  licensePlate: string;
  /**
   * Show only the most recent N entries.
   *
   * Used by the Overview tab, which wants a glance rather than a
   * history. The queries are identical either way, so the two renders
   * share one cache entry instead of fetching the same records twice.
   */
  maxEntries?: number;
  /** Rendered under the list -- typically a link to the full history. */
  footer?: React.ReactNode;
}

export function VehicleActivityTimeline({
  vehicleId,
  licensePlate,
  maxEntries,
  footer,
}: VehicleActivityTimelineProps) {
  const fuel = useVehicleFuelHistory(licensePlate, PER_SOURCE_LIMIT);
  const expenses = useVehicleExpenseHistory(licensePlate, 1, PER_SOURCE_LIMIT);
  const trips = useTripsList({ license_plate: licensePlate, page: 1, limit: PER_SOURCE_LIMIT });
  const maintenance = useVehicleMaintenanceHistory(licensePlate, 1, PER_SOURCE_LIMIT);
  const workOrders = useWorkOrderList({
    license_plate: licensePlate,
    page: 1,
    limit: PER_SOURCE_LIMIT,
  });
  const audit = useVehicleActivity(vehicleId, 1);

  const sources = [
    { label: 'fuel logs', query: fuel },
    { label: 'expenses', query: expenses },
    { label: 'trips', query: trips },
    { label: 'maintenance', query: maintenance },
    { label: 'work orders', query: workOrders },
    { label: 'record changes', query: audit },
  ];

  const failed = sources.filter((s) => s.query.isError);
  const isLoading = sources.some((s) => s.query.isLoading);

  const { entries: allEntries, undatedCount } = useMemo(
    () =>
      buildVehicleTimeline({
        fuel: fuel.data?.data ?? [],
        expenses: expenses.data?.data ?? [],
        trips: trips.data?.data ?? [],
        maintenance: maintenance.data?.data ?? [],
        workOrders: workOrders.data?.data ?? [],
        audit: audit.data?.data ?? [],
      }),
    [fuel.data, expenses.data, trips.data, maintenance.data, workOrders.data, audit.data]
  );

  const entries = maxEntries ? allEntries.slice(0, maxEntries) : allEntries;

  const retryAll = () => {
    for (const source of failed) source.query.refetch();
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {failed.length > 0 && (
        /*
          Named sources, not "something went wrong". The list below is
          still rendered from whatever DID load, and this says exactly
          what is missing from it -- a partial history presented as a
          complete one is the failure this warning exists to prevent.
        */
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>This history is incomplete</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Couldn&apos;t load {failed.map((f) => f.label).join(', ')}. Everything else is shown
              below.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={retryAll}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {entries.length === 0 && failed.length === 0 ? (
        <EmptyState
          icon={<History className="size-8 text-muted-foreground" aria-hidden="true" />}
          title="Nothing has happened to this vehicle yet"
          description="Fuel, expenses, trips, services and work orders all appear here as they are recorded. Use the actions above to record the first one."
        />
      ) : (
        <ol className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-3">
              <span className={cn('mt-0.5 shrink-0', KIND_TONE[entry.kind])}>
                {KIND_ICON[entry.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-body font-medium">
                    {entry.href ? (
                      <Link href={entry.href} className="hover:underline">
                        {entry.title}
                      </Link>
                    ) : (
                      entry.title
                    )}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {TIMELINE_KIND_LABELS[entry.kind]}
                  </span>
                </div>
                {entry.detail && (
                  <p className="text-body-sm text-muted-foreground">{entry.detail}</p>
                )}
              </div>
              <time
                dateTime={entry.at}
                className="shrink-0 text-caption text-muted-foreground tabular-nums"
              >
                {formatDate(entry.at, 'MMM dd, yyyy HH:mm')}
              </time>
            </li>
          ))}
        </ol>
      )}

      {footer}

      {/*
        Suppressed on a truncated view: "3 records carry no date" next to
        a list deliberately showing only six of forty is a sentence that
        cannot be acted on. The full Activity tab states it.
      */}
      {undatedCount > 0 && !maxEntries && (
        /*
          Stated rather than swallowed. These records exist and are
          reachable from their own modules; they are missing from THIS
          list because they carry no date to place them on, and inventing
          one would reorder someone's history.
        */
        <p className="text-caption text-muted-foreground">
          {undatedCount} {undatedCount === 1 ? 'record is' : 'records are'} not shown here because
          they carry no date. They are still listed in their own modules.
        </p>
      )}
    </div>
  );
}
