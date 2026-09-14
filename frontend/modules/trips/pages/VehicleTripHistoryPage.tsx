// frontend/modules/trips/pages/VehicleTripHistoryPage.tsx
//
// WAVE 1 PART 2, item 3: the vehicle-scoped trip history deep link from
// the Vehicle Operational Hub -- `/trips/vehicles/[plate]`, mirroring
// the existing `/fuel/vehicles/[plate]`, `/maintenance/vehicles/[plate]`
// and `/expenses/vehicles/[plate]` convention rather than inventing a
// query-param filter on the general Trips list page.
//
// ---------------------------------------------------------------------
// NO SECOND TRIP QUERY SYSTEM
// ---------------------------------------------------------------------
// This reuses `useTripsList` (the same hook and the same `/api/trips`
// endpoint TripsListPage already calls), `TripsTable` (the same table,
// cost column included), and `useTripCostAnalytics` (the same join
// TripsListPage and TripDetailPage already use). The only new thing is
// a stricter MATCH MODE on an existing filter.
//
// ---------------------------------------------------------------------
// WHY "license_plate" ALONE WAS NOT ENOUGH
// ---------------------------------------------------------------------
// `TripFilters.license_plate` matches as a case-insensitive SUBSTRING
// (see trip.repository.ts's buildScopedQuery / shared/utils/
// regex.utils.ts's containsMatch) -- correct for the Trips page's
// free-text search box, where a partial plate should surface candidates.
// Reusing that as-is here would mean vehicle "HRE123"'s history page
// could also show "HRE1234"'s trips: a real vehicle-identity leak, not
// a hypothetical one, on a screen whose entire contract is "only this
// vehicle." `exactLicensePlate: true` (new on TripFilters, threaded
// through to an exact, case-folded query match) is what this page sets
// that the general list page does not -- see trip-history-vehicle-
// scope.spec.ts for the regression test pinning this.
//
// DISCOVERED, NOT FIXED HERE: VehicleFuelHistoryPage / VehicleMaintenanceHistoryPage /
// VehicleExpenseHistoryPage all reuse their module's general list query
// the same way, and none of them pass an exact-match equivalent -- the
// identical defect exists there today. Out of scope for this Wave (this
// wave is the Vehicle Operational Hub / Trips vertical slice, not a
// cross-module fix), reported to the operator rather than silently
// carried forward into new code.

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useTripsList } from '../hooks/useTrips';
import { useTripCostAnalytics } from '../hooks/useTripCostAnalytics';
import { useCreateTrip } from '../hooks/useTripMutations';
import { TripsTable } from '../components/TripsTable';
import { TripModal, type TripModalMode } from '../components/TripModal';
import { canManageTrips } from '../utils';
import { TRIP_ROUTES } from '../routes';
import type { Trip, TripCostAnalyticsRow } from '../types';
import type { TripFormValues } from '../schemas';

const PAGE_SIZE = 10;

interface VehicleTripHistoryPageProps {
  licensePlate: string;
}

export function VehicleTripHistoryPage({ licensePlate }: VehicleTripHistoryPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageTrips(roles);

  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: TripModalMode = 'create';

  const listParams = useMemo(
    () => ({ license_plate: licensePlate, exactLicensePlate: true as const, page, limit: PAGE_SIZE }),
    [licensePlate, page]
  );
  const { data: result, isLoading, isError, error, refetch } = useTripsList(listParams);

  /**
   * All-time cost for this vehicle's trips (no date range) -- the same
   * TripCostAnalyticsRow join TripsListPage/TripDetailPage use.
   * license_plate here already goes through the analytics endpoints'
   * OWN exact-match path (buildBaseMatch: `licensePlate.toUpperCase()`,
   * never containsMatch), so no separate exact flag is needed on this
   * call.
   */
  const { data: costRows } = useTripCostAnalytics(undefined, 500, licensePlate);
  const costByTripId = useMemo(() => {
    const map = new Map<string, TripCostAnalyticsRow>();
    for (const row of costRows ?? []) map.set(row.tripId, row);
    return map;
  }, [costRows]);

  const createTrip = useCreateTrip();

  async function handleSubmit(values: TripFormValues) {
    // Overrides whatever the form's own vehicle field holds -- a trip
    // logged from THIS page is always attributed to this vehicle,
    // mirroring VehicleFuelHistoryPage's identical override.
    await createTrip.mutateAsync({ ...values, license_plate: licensePlate } as Required<TripFormValues>);
  }

  const breadcrumbs = [{ label: 'Trips', href: TRIP_ROUTES.list }, { label: licensePlate }];
  const backButton = (
    <Button variant="outline" size="sm" onClick={() => router.push(TRIP_ROUTES.list)}>
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Trip history · ${licensePlate}`}
        description={
          result
            ? `${result.pagination.total} trip${result.pagination.total === 1 ? '' : 's'} on record for this vehicle.`
            : undefined
        }
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {backButton}
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Log trip
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 surface-card">
        <TripsTable
          result={result}
          isLoading={isLoading}
          isError={isError}
          errorMessage={describeQueryError(error)}
          onRetry={() => refetch()}
          // No filter bar on a vehicle-scoped screen: the vehicle IS the
          // filter, and the general list page already covers "trips
          // matching X". The empty state below still distinguishes
          // "never driven" from a failed fetch via TripsTable's own
          // isError branch.
          hasFilters={false}
          onCreate={canManage ? () => setModalOpen(true) : undefined}
          costByTripId={costByTripId}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={new Set<string>()}
          onToggleSelect={() => {}}
          onToggleSelectAll={() => {}}
          onView={(trip: Trip) => router.push(TRIP_ROUTES.detail(trip._id!))}
          onEdit={() => {}}
          onDelete={() => {}}
          canManage={false}
          canDelete={false}
        />
      </div>

      <TripModal
        open={modalOpen}
        mode={modalMode}
        defaultLicensePlate={licensePlate}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
