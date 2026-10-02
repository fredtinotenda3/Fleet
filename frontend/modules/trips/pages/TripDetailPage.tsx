// frontend/modules/trips/pages/TripDetailPage.tsx

'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useTrip } from '../hooks/useTrips';
import { useDeleteTrip, useUpdateTrip } from '../hooks/useTripMutations';
import { TripPlaybackPanel } from '../components/TripPlaybackPanel';
import { TripModal, type TripModalMode } from '../components/TripModal';
import {
  tripModeLabel,
  getTripModeBadgeClass,
  canManageTrips,
  canDeleteTrips,
  buildDistanceEvidence,
} from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { TRIP_ROUTES } from '../routes';
import type { TripFormValues } from '../schemas';
import { cn } from '@/lib/utils';
import { EvidencePopover } from '@/frontend/shared/ui/evidence/EvidencePopover';
import { useFuelLogsList } from '@/frontend/modules/fuel/hooks/useFuel';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import { useExpensesList } from '@/frontend/modules/expenses/hooks/useExpenses';
import { EXPENSE_ROUTES } from '@/frontend/modules/expenses/routes';
import { useDriver } from '@/frontend/modules/drivers/hooks/useDrivers';
import { useDispatchJob } from '@/frontend/modules/dispatch/hooks/useDispatch';
import { DISPATCH_ROUTES } from '@/frontend/modules/dispatch/routes';
import { DispatchStatusBadge } from '@/frontend/modules/dispatch/components/DispatchStatusBadge';

interface TripDetailPageProps {
  tripId: string;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground flex items-center gap-1.5">{value}</span>
    </div>
  );
}

export function TripDetailPage({ tripId }: TripDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageTrips(roles);
  const canDelete = canDeleteTrips(roles);

  const hasFuelView = permissionService.hasPermission(roles, Permission.FUEL_VIEW);
  const hasExpenseView = permissionService.hasPermission(roles, Permission.EXPENSE_VIEW);
  // Driver routes are gated on VEHICLE_VIEW (see app/api/drivers/[id]/route.ts),
  // not a separate driver permission -- mirrored here so a role that can see
  // trips but not drivers/vehicles never issues a request that can only 403.
  const hasDriverView = permissionService.hasPermission(roles, Permission.VEHICLE_VIEW);
  const hasDispatchView = permissionService.hasPermission(roles, Permission.DISPATCH_VIEW);

  const { data: trip, isLoading, isError } = useTrip(tripId);
  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip(tripId);
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: TripModalMode = 'edit';

  /**
   * MODULE CONNECTIVITY UPGRADE (Trip <-> Fuel/Expense gap): both
   * FuelLog and Expense have carried an optional tripId FK for a while
   * (see each type's own doc comment), but nothing read it back as a
   * filter until this round, and Trip Detail had no section showing
   * what was actually logged against this trip -- a real "disconnected
   * CRUD" gap on the one screen that should answer "what did this trip
   * cost". `enabled` is gated per-permission so a role that can see
   * trips but not fuel/expenses never issues a request that can only
   * 403.
   */
  const { data: linkedFuel, isLoading: isFuelLoading } = useFuelLogsList(
    { tripId, limit: 50 },
    { enabled: hasFuelView }
  );
  const { data: linkedExpenses, isLoading: isExpenseLoading } = useExpensesList(
    { tripId, limit: 50 },
    { enabled: hasExpenseView }
  );

  /**
   * ROUND 5 FIX -- "Driver" used to render the raw Mongo ObjectId
   * (trip.driver_id) to the user instead of a name, the most literal
   * instance of "shared id, no real UI wiring" the real-fleet audit
   * found. Mirrors DispatchDetailPage's identical resolution exactly.
   * `useDriver` no-ops (stays disabled) when the viewer lacks
   * VEHICLE_VIEW or the trip has no driver assigned, and the id itself
   * is kept as the fallback if the lookup 404s (e.g. a legacy trip
   * whose driver was since deleted) rather than showing nothing.
   */
  const { data: driver } = useDriver(hasDriverView ? trip?.driver_id : undefined);

  /**
   * ROUND 5 FIX -- Trip Detail never showed its linked Dispatch job even
   * though Trip.dispatchJobId / DispatchJob.tripId is a real,
   * bidirectionally-written field (DispatchService.attachCreatedTrip /
   * linkExistingTrip). DispatchDetailPage already links the other way
   * (job -> trip); this is the missing direction.
   */
  const { data: linkedDispatchJob } = useDispatchJob(
    hasDispatchView ? trip?.dispatchJobId : undefined
  );

  if (isLoading) return <PageLoader label="Loading trip" />;

  if (isError || !trip) {
    return (
      <EmptyState
        title="Trip not found"
        description="This trip may have been removed or you don't have access to it."
        action={{ label: 'Back to trips', onClick: () => router.push(TRIP_ROUTES.list) }}
      />
    );
  }

  async function handleDelete() {
    if (!window.confirm('Delete this trip?')) return;
    await deleteTrip.mutateAsync(tripId);
    router.push(TRIP_ROUTES.list);
  }

  async function handleSubmit(values: TripFormValues) {
    await updateTrip.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Trip · ${trip.license_plate}`}
        description={formatDate(trip.date, 'MMM dd, yyyy')}
        breadcrumbs={[{ label: 'Trips', href: TRIP_ROUTES.list }, { label: trip.license_plate }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(TRIP_ROUTES.list)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('badge-status', getTripModeBadgeClass(trip.mode))}>
          {tripModeLabel(trip.mode)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trip overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Vehicle" value={trip.license_plate} />
            <DetailRow label="Date" value={formatDate(trip.date)} />
            <DetailRow label="Mode" value={tripModeLabel(trip.mode)} />
            <DetailRow
              label="Distance"
              value={
                <>
                  {formatDistance(trip.distance_calculated)}
                  {(() => {
                    const evidence = buildDistanceEvidence(trip);
                    return evidence ? (
                      <EvidencePopover
                        title="Distance — how calculated"
                        sourceLabel={evidence.sourceLabel}
                        sourceTone={evidence.sourceTone}
                        method={evidence.method}
                        calculatedAt={evidence.calculatedAt}
                        reference={evidence.reference}
                        reason={evidence.reason}
                      />
                    ) : null;
                  })()}
                </>
              }
            />
            {/*
              PART 10 -- honesty over fabrication: this trip's distance did
              not come from telemetry (a map-assisted or manually logged
              trip never implies a tracker exists), and this line says so
              explicitly rather than leaving the reader to guess from the
              distance source alone whether this vehicle is tracked at all.
            */}
            <DetailRow
              label="Telematics"
              value={(() => {
                /**
                 * `telemetry_available` is only recorded going forward
                 * (see CreateTripHandler/UpdateTripHandler) -- a trip
                 * logged before this field existed has it as
                 * `undefined`, which is NOT the same fact as "no tracker"
                 * and must not be rendered as one. A gps-path source is
                 * itself proof a tracker was involved regardless of what
                 * this field says.
                 */
                if (trip.telemetry_available === true || trip.distance_source === 'gps-path') {
                  return <span className="text-success">Tracker active on this vehicle</span>;
                }
                if (trip.telemetry_available === false) {
                  return <span className="text-muted-foreground italic">No telematics connected</span>;
                }
                return <span className="text-muted-foreground italic">Not recorded for this trip</span>;
              })()}
            />
            <DetailRow
              label="Driver"
              value={
                trip.driver_id
                  ? driver?.name ?? (hasDriverView ? trip.driver_id : 'Driver')
                  : 'Unassigned'
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Route &amp; readings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Start location" value={trip.start_location || 'Not recorded'} />
            <DetailRow label="End location" value={trip.end_location || 'Not recorded'} />
            {trip.mode === 'odometer' && (
              <>
                <DetailRow
                  label="Start odometer"
                  value={trip.start_odometer != null ? formatDistance(trip.start_odometer) : 'N/A'}
                />
                <DetailRow
                  label="End odometer"
                  value={trip.end_odometer != null ? formatDistance(trip.end_odometer) : 'N/A'}
                />
              </>
            )}
            {trip.mode === 'distance' && (
              <DetailRow
                label="Logged distance"
                value={trip.trip_distance != null ? formatDistance(trip.trip_distance) : 'N/A'}
              />
            )}
            {trip.mode === 'map' && trip.stops && trip.stops.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                  Route (map-derived, not GPS)
                </p>
                <ol className="space-y-1">
                  {[...trip.stops]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((stop, i) => (
                      <li key={stop.sequence} className="text-body-sm flex items-center gap-2">
                        <span className="text-caption text-muted-foreground w-14 shrink-0">
                          {stop.role === 'start' ? 'Start' : stop.role === 'end' ? 'End' : `Stop ${i + 1}`}
                        </span>
                        <span className="text-foreground">{stop.label}</span>
                      </li>
                    ))}
                </ol>
                {trip.route?.legs && trip.route.legs.length > 0 && (
                  <ul className="text-caption text-muted-foreground space-y-0.5 pl-14">
                    {trip.route.legs.map((leg, i) => (
                      <li key={i}>
                        Leg {i + 1}: {formatDistance(leg.distanceKm)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/*
          ROUND 5 FIX -- Trip <-> Dispatch is bidirectional in the data
          model (Trip.dispatchJobId / DispatchJob.tripId, written
          together by DispatchService) and DispatchDetailPage already
          links job -> trip, but nothing showed the reverse direction.
          Only rendered when the trip actually carries a dispatchJobId
          and the caller holds DISPATCH_VIEW; absent otherwise, same
          permission-gated-silence convention as "Linked costs" below.
        */}
        {trip.dispatchJobId && hasDispatchView && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Dispatch</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() => router.push(DISPATCH_ROUTES.detail(trip.dispatchJobId!))}
                className="flex w-full items-center justify-between gap-3 rounded-md py-1.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-body-sm text-foreground">
                  {linkedDispatchJob?.title ?? 'This trip was logged against a dispatch job'}
                </span>
                {linkedDispatchJob && <DispatchStatusBadge status={linkedDispatchJob.status} />}
              </button>
            </CardContent>
          </Card>
        )}

        {/*
          Full width, directly under "Route & readings" -- the card that
          already holds the start and end locations. Playback is the same
          question answered in more detail.
        */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Route playback</CardTitle>
          </CardHeader>
          <CardContent>
            <TripPlaybackPanel tripId={tripId} />
          </CardContent>
        </Card>

        {/*
          MODULE CONNECTIVITY UPGRADE (Trip <-> Fuel/Expense gap): "what
          did this trip cost" had no answer anywhere in the product even
          though both FuelLog.tripId and Expense.tripId already existed --
          see the hook calls above for the full story. Only rendered when
          the caller holds the matching view permission; silently absent
          (not an error) otherwise, same convention SavingsStrip already
          uses for a permission-gated section.
        */}
        {(hasFuelView || hasExpenseView) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Linked costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasFuelView && (
                <div>
                  <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                    Fuel logged on this trip
                  </p>
                  {isFuelLoading ? (
                    <p className="text-body-sm text-muted-foreground">Loading…</p>
                  ) : !linkedFuel || linkedFuel.data.length === 0 ? (
                    <p className="text-body-sm italic text-muted-foreground">
                      No fuel log has been linked to this trip.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {linkedFuel.data.map((log, index) => (
                        <li key={log._id ?? index}>
                          <button
                            type="button"
                            disabled={!log._id}
                            onClick={() => log._id && router.push(FUEL_ROUTES.detail(log._id))}
                            className="flex w-full items-center justify-between gap-3 py-1.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <span className="text-body-sm text-foreground">{formatDate(log.date)}</span>
                            <span className="text-body-sm font-medium tabular-nums text-foreground">
                              {formatCurrency(log.cost, { currency: log.currency || 'USD' })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {hasExpenseView && (
                <div>
                  <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                    Expenses logged on this trip
                  </p>
                  {isExpenseLoading ? (
                    <p className="text-body-sm text-muted-foreground">Loading…</p>
                  ) : !linkedExpenses || linkedExpenses.data.length === 0 ? (
                    <p className="text-body-sm italic text-muted-foreground">
                      No expense has been linked to this trip.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {linkedExpenses.data.map((expense, index) => (
                        <li key={expense._id ?? index}>
                          <button
                            type="button"
                            disabled={!expense._id}
                            onClick={() => expense._id && router.push(EXPENSE_ROUTES.detail(expense._id))}
                            className="flex w-full items-center justify-between gap-3 py-1.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <span className="text-body-sm text-foreground">
                              {formatDate(expense.date)}
                              {expense.description ? ` · ${expense.description}` : ''}
                            </span>
                            <span className="text-body-sm font-medium tabular-nums text-foreground">
                              {formatCurrency(expense.amount, { currency: expense.currency || 'USD' })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {trip.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-body-sm text-foreground">{trip.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <TripModal open={modalOpen} mode={modalMode} trip={trip} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}