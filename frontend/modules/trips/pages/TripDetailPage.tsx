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
import { TRIP_ROUTES } from '../routes';
import type { TripFormValues } from '../schemas';
import { cn } from '@/lib/utils';
import { EvidencePopover } from '@/frontend/shared/ui/evidence/EvidencePopover';

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

  const { data: trip, isLoading, isError } = useTrip(tripId);
  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip(tripId);
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: TripModalMode = 'edit';

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
            <DetailRow label="Driver" value={trip.driver_id || 'Unassigned'} />
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