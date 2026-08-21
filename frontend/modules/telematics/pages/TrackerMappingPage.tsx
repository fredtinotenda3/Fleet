// frontend/modules/telematics/pages/TrackerMappingPage.tsx
//
// Admin screen for linking an unmatched Eagle Track tracker (uin) to a
// Fleet vehicle.
//
// ---------------------------------------------------------------------
// WHY THIS SCREEN EXISTS
// ---------------------------------------------------------------------
// The Eagle Track adapter matches a tracker to a vehicle by walking
// vendor free text -- `plate`, then `__platenumber`, then `name` -- and
// its own header states the residual ambiguity plainly: if two of those
// fields hold the plates of two DIFFERENT vehicles, the order resolves
// it deterministically and nothing flags the conflict. A tracker whose
// `name` is "Truck 3" rather than a plate never matches at all.
//
// An operator-declared link removes the guess for the trackers somebody
// has looked at, and the adapter consults it BEFORE any heuristic. The
// unmatched list here is the worklist the sync has always produced and
// previously discarded.
//
// ---------------------------------------------------------------------
// THE VEHICLE ID IS THE _id, NOT THE PLATE
// ---------------------------------------------------------------------
// The picker submits the vehicle's Mongo _id. Plates are mutable -- a
// re-plated vehicle would silently break a plate-keyed link and the
// tracker would fall back to heuristics without anything saying so.
// This is the same _id-over-plate decision the finance module's
// allocation postings made, and for the same reason.

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  useCreateTrackerLink,
  useDeleteTrackerLink,
  useEagleTrackTrackerMapping,
} from '../hooks';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import type { EagleTrackUnmatchedTracker } from '../types';

export function TrackerMappingPage() {
  const { data, isLoading, error } = useEagleTrackTrackerMapping();
  const { data: vehiclePage } = useVehiclesList({ page: 1, limit: 200 });
  const createLink = useCreateTrackerLink();
  const deleteLink = useDeleteTrackerLink();

  const [selection, setSelection] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const vehicles = useMemo(() => vehiclePage?.data ?? [], [vehiclePage]);

  const handleLink = async (tracker: EagleTrackUnmatchedTracker) => {
    const vehicleId = selection[tracker.uin];
    if (!vehicleId) return;

    setFailure(null);
    try {
      await createLink.mutateAsync({ uin: tracker.uin, vehicleId });
      setSelection((current) => {
        const next = { ...current };
        delete next[tracker.uin];
        return next;
      });
    } catch (mutationError) {
      // Surfaced verbatim: the server's messages here are actionable
      // ("already linked to another vehicle", "not a license plate"),
      // and replacing them with a generic failure would hide the one
      // piece of information the operator needs.
      setFailure(mutationError instanceof Error ? mutationError.message : 'Could not create the link.');
    }
  };

  const handleUnlink = async (uin: string) => {
    setFailure(null);
    try {
      await deleteLink.mutateAsync(uin);
    } catch (mutationError) {
      setFailure(mutationError instanceof Error ? mutationError.message : 'Could not remove the link.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading tracker mapping...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        Could not load the tracker mapping.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Eagle Track tracker mapping</h1>
        <p className="text-sm text-muted-foreground">
          Link a tracker to a vehicle when automatic matching cannot place it. A link takes
          precedence over plate and name matching.
        </p>
        {data?.lastSyncAt ? (
          <p className="text-xs text-muted-foreground">
            Worklist from the sync at {new Date(data.lastSyncAt).toLocaleString()}.
          </p>
        ) : null}
      </header>

      {!data?.eagletrackConfigured ? (
        <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Eagle Track is not configured for this organization.
        </p>
      ) : null}

      {failure ? (
        <p
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {failure}
        </p>
      ) : null}

      <section aria-labelledby="unmatched-heading" className="space-y-3">
        <h2 id="unmatched-heading" className="text-sm font-semibold text-foreground">
          Unmatched trackers ({data?.unmatched.length ?? 0})
        </h2>

        {(data?.unmatched.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every tracker in the last sync was matched to a vehicle.
          </p>
        ) : (
          <ul className="space-y-2">
            {data?.unmatched.map((tracker) => (
              <li
                key={tracker.uin}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {tracker.name || tracker.uin}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    uin {tracker.uin}
                    {tracker.plate ? ` \u00b7 plate ${tracker.plate}` : ''}
                    {tracker.model ? ` \u00b7 ${tracker.model}` : ''}
                  </p>
                  {/* A tracker with no fix has no telemetry to match on,
                      so it is the likeliest to need a manual link --
                      worth saying rather than leaving the operator to
                      infer it. */}
                  {!tracker.hadFix ? (
                    <Badge className="bg-muted text-muted-foreground">No position reported</Badge>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <label className="sr-only" htmlFor={`vehicle-${tracker.uin}`}>
                    Vehicle for tracker {tracker.uin}
                  </label>
                  <select
                    id={`vehicle-${tracker.uin}`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={selection[tracker.uin] ?? ''}
                    onChange={(event) =>
                      setSelection((current) => ({ ...current, [tracker.uin]: event.target.value }))
                    }
                  >
                    <option value="">Select a vehicle...</option>
                    {vehicles.map((vehicle) => (
                      <option key={String(vehicle._id)} value={String(vehicle._id)}>
                        {vehicle.license_plate}
                        {vehicle.make || vehicle.model ? ` - ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trimEnd() : ''}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    disabled={!selection[tracker.uin] || createLink.isPending}
                    onClick={() => handleLink(tracker)}
                  >
                    <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Link
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="links-heading" className="space-y-3">
        <h2 id="links-heading" className="text-sm font-semibold text-foreground">
          Existing links ({data?.links.length ?? 0})
        </h2>

        {(data?.links.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No manual links yet.</p>
        ) : (
          <ul className="space-y-2">
            {data?.links.map((link) => (
              <li
                key={link.uin}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {link.licensePlate ?? link.vehicleId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    uin {link.uin}
                    {link.trackerName ? ` \u00b7 ${link.trackerName}` : ''}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteLink.isPending}
                  onClick={() => handleUnlink(link.uin)}
                  aria-label={`Remove the link for tracker ${link.uin}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
