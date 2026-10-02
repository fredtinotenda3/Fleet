// frontend/modules/dispatch/components/LinkTripDialog.tsx
//
// ROUND 4 (Dispatch <-> Trip core requirement) -- TRIP -> DISPATCH
// direction's UI. Associates an existing, independently-logged trip
// with this dispatch job after the fact (POST
// /api/dispatch/[id]/link-trip -> DispatchService.linkExistingTrip).
//
// This is deliberately the ONLY trip-linking UI built this round --
// there is no "Start trip from dispatch" button that deep-links into
// TripModal. TripsListPage does not read any prefill query params (no
// `?license_plate=`, unlike WorkOrderListPage), and TripForm's schema
// has no `dispatchJobId` field, so wiring the DISPATCH -> TRIP direction
// into the UI would mean adding a hidden field to the Round 1-3
// map-assisted trip form -- a sophisticated, already-shipped and
// already-verified form -- for a convenience, not a capability: the
// backend's DISPATCH -> TRIP commit (CreateTripHandler's
// `dispatchJobId` pre-check + DispatchService.attachCreatedTrip) is
// real and tested from that side, but the only thing missing to reach
// it from here is one query param and one hidden form field. Risk
// against a stable module outweighed the convenience, so it is left as
// a documented follow-up rather than built. This dialog alone fully
// satisfies the Harare ABC123 acceptance scenario: that fleet has no
// GPS, so the trip is recorded once the run is over (exactly what
// linkExistingTrip exists for), not live from a "start trip" button.
//
// Offers two ways to pick the trip: a dropdown of the assigned
// vehicle's own recent trips not already linked to a (different)
// dispatch job, and a manual trip-ID fallback for anything outside that
// list (a different vehicle logged it, or it's further back than the
// dropdown's window). Both call the same mutation -- the dropdown is a
// convenience over the same `tripId` the manual field accepts.

'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { formatDate } from '@/shared/utils/date.utils';
import { useVehicle } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useTripsList } from '@/frontend/modules/trips/hooks/useTrips';
import type { DispatchJob } from '../types';

interface LinkTripDialogProps {
  open: boolean;
  job: DispatchJob | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tripId: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function LinkTripDialog({ open, job, onOpenChange, onSubmit, isSubmitting }: LinkTripDialogProps) {
  const [selectedTripId, setSelectedTripId] = useState('');
  const [manualTripId, setManualTripId] = useState('');

  const { data: vehicle } = useVehicle(job?.assignedVehicleId, { enabled: open && Boolean(job?.assignedVehicleId) });

  const { data: tripsResult, isLoading: isLoadingTrips } = useTripsList({
    license_plate: vehicle?.license_plate,
    exactLicensePlate: true,
    limit: 20,
  });

  // Exclude trips already linked to a DIFFERENT dispatch job -- one
  // already linked to THIS job can't occur (assertCanLinkTrip refuses
  // to re-link once job.tripId is set, so this dialog never opens for
  // an already-linked job in the first place).
  const candidateTrips = useMemo(
    () => (tripsResult?.data ?? []).filter((t) => !t.dispatchJobId),
    [tripsResult?.data]
  );

  if (!job) return null;

  const effectiveTripId = selectedTripId || manualTripId.trim();

  async function handleSubmit() {
    if (!effectiveTripId) return;
    await onSubmit(effectiveTripId);
    setSelectedTripId('');
    setManualTripId('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link a trip</DialogTitle>
          <DialogDescription>
            Associate a trip that was already logged for this job&apos;s work with &quot;{job.title}&quot;. The
            job&apos;s status, evidence and cost will follow the trip once linked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {vehicle?.license_plate && (
            <div className="space-y-1.5">
              <Label htmlFor="link-trip-select">Recent trips for {vehicle.license_plate}</Label>
              <Select
                value={selectedTripId}
                onValueChange={(v) => {
                  setSelectedTripId(v ?? '');
                  if (v) setManualTripId('');
                }}
                disabled={isLoadingTrips}
              >
                <SelectTrigger id="link-trip-select" className="w-full">
                  <SelectValue
                    placeholder={
                      isLoadingTrips
                        ? 'Loading trips…'
                        : candidateTrips.length === 0
                          ? 'No unlinked trips found for this vehicle'
                          : 'Select a trip'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidateTrips.map((trip) => (
                    <SelectItem key={trip._id} value={trip._id!}>
                      {formatDate(trip.date)} · {trip.status ?? 'planned'}
                      {trip.trip_distance ? ` · ${trip.trip_distance} ${trip.unit_id ?? ''}`.trimEnd() : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="link-trip-manual">Or enter a trip ID</Label>
            <Input
              id="link-trip-manual"
              placeholder="Trip ID"
              value={manualTripId}
              onChange={(e) => {
                setManualTripId(e.target.value);
                if (e.target.value) setSelectedTripId('');
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!effectiveTripId || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? 'Linking...' : 'Link trip'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
