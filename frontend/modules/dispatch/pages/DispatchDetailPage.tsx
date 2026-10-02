// frontend/modules/dispatch/pages/DispatchDetailPage.tsx
//
// Mirrors WorkOrderDetailPage.tsx's structure: loading, then error
// (checked BEFORE not-found -- a failed fetch must never read as "this
// job was deleted"), then not-found, then the real page.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Link2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ErrorState, describeQueryError } from '@/frontend/shared/ui/patterns';
import { formatDate } from '@/shared/utils/date.utils';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicle } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useDriver } from '@/frontend/modules/drivers/hooks/useDrivers';
import { VEHICLE_ROUTES } from '@/frontend/modules/vehicles/routes';
import { TRIP_ROUTES } from '@/frontend/modules/trips/routes';
import { useDispatchJob, useDispatchCost } from '../hooks/useDispatch';
import { useAssignDispatchJob, useLinkDispatchTrip } from '../hooks/useDispatchMutations';
import { DispatchStatusBadge } from '../components/DispatchStatusBadge';
import { DispatchStatusActions } from '../components/DispatchStatusActions';
import { AssignDispatchDialog } from '../components/AssignDispatchDialog';
import { LinkTripDialog } from '../components/LinkTripDialog';
import {
  PRIORITY_BADGE_CLASSES,
  getPriorityLabel,
  formatDispatchCost,
  canAssignDispatch,
  canManageDispatch,
  canLinkTrip,
} from '../utils';
import { DISPATCH_ROUTES } from '../routes';
import type { AssignDispatchPayload } from '../types';

interface DispatchDetailPageProps {
  id: string;
}

export function DispatchDetailPage({ id }: DispatchDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canAssign = canAssignDispatch(roles);
  /** The link-trip endpoint is gated on DISPATCH_MANAGE server-side (see app/api/dispatch/[id]/link-trip/route.ts). */
  const canLink = canManageDispatch(roles);

  const { data: job, isLoading, isError, error, refetch } = useDispatchJob(id);
  const assignJob = useAssignDispatchJob(id);
  const linkTrip = useLinkDispatchTrip(id);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [linkTripDialogOpen, setLinkTripDialogOpen] = useState(false);

  const { data: vehicle } = useVehicle(job?.assignedVehicleId);
  const { data: driver } = useDriver(job?.assignedDriverId);
  const { data: cost } = useDispatchCost(job?.tripId ? id : undefined);

  if (isLoading) return <LoadingState type="full" />;
  // Failure branch checked before not-found -- see WorkOrderDetailPage's
  // identical comment for why that order matters.
  if (isError) {
    return (
      <ErrorState
        title="This dispatch job didn't load"
        description="The dispatch job could not be fetched. This does not mean it has been cancelled or removed."
        detail={describeQueryError(error)}
        onRetry={() => refetch()}
        size="page"
      />
    );
  }
  if (!job) {
    return (
      <EmptyState
        title="Dispatch job not found"
        description="It may have been removed, or the link is incorrect."
        action={{ label: 'Back to dispatch', onClick: () => router.push(DISPATCH_ROUTES.list) }}
      />
    );
  }

  async function handleAssign(values: AssignDispatchPayload) {
    await assignJob.mutateAsync(values);
  }

  async function handleLinkTrip(tripId: string) {
    await linkTrip.mutateAsync({ tripId });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.title}
        description={`${job.pickupLocation}${job.dropoffLocation ? ` → ${job.dropoffLocation}` : ''}`}
        breadcrumbs={[{ label: 'Dispatch', href: DISPATCH_ROUTES.list }, { label: job.title }]}
        actions={
          <div className="flex items-center gap-2">
            {canAssign && job.status === 'unassigned' && (
              <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Assign vehicle and driver
              </Button>
            )}
            {canLink && canLinkTrip(job) && (
              <Button variant="outline" size="sm" onClick={() => setLinkTripDialogOpen(true)}>
                <Link2 className="h-3.5 w-3.5" />
                Link trip
              </Button>
            )}
            <DispatchStatusActions job={job} roles={roles} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-medium">Dispatch details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <DispatchStatusBadge status={job.status} />
            </div>
            <div>
              <p className="text-muted-foreground">Priority</p>
              <Badge className={PRIORITY_BADGE_CLASSES[job.priority ?? 'medium']}>
                {getPriorityLabel(job.priority)}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Vehicle</p>
              {vehicle ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-medium"
                  onClick={() => router.push(VEHICLE_ROUTES.detail(vehicle._id!))}
                >
                  {vehicle.license_plate}
                </Button>
              ) : (
                <p className="font-medium">Unassigned</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Driver</p>
              <p className="font-medium">{driver?.name ?? 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pickup</p>
              <p className="font-medium">{job.pickupLocation}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Dropoff</p>
              <p className="font-medium">{job.dropoffLocation ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Scheduled for</p>
              <p className="font-medium">{job.scheduledFor ? formatDate(job.scheduledFor) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">{job.startedAt ? formatDate(job.startedAt) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">{job.completedAt ? formatDate(job.completedAt) : '—'}</p>
            </div>
            {job.jobReference && (
              <div>
                <p className="text-muted-foreground">Job reference</p>
                <p className="font-medium">{job.jobReference}</p>
              </div>
            )}
            {/*
              DISPATCH <-> TRIP core requirement: whichever direction
              created the link (a trip started from this job, or an
              existing trip associated after the fact), the other half
              is always this same field -- see DispatchJob.tripId's doc
              comment in dispatch.types.ts.
            */}
            <div className="col-span-2">
              <p className="text-muted-foreground">Trip</p>
              {job.tripId ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-medium"
                  onClick={() => router.push(TRIP_ROUTES.detail(job.tripId!))}
                >
                  View linked trip
                </Button>
              ) : (
                <p className="font-medium">No trip linked yet</p>
              )}
            </div>
            {job.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium whitespace-pre-wrap">{job.notes}</p>
              </div>
            )}
            {job.status === 'cancelled' && job.cancelledReason && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Cancellation reason</p>
                <p className="font-medium whitespace-pre-wrap">{job.cancelledReason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Cost</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/*
              Never fabricated -- see DispatchService.getCostSummary's
              doc comment. `available: false` (no trip linked yet) is
              shown as an honest "not yet known", not a $0 that would
              read as "this job cost nothing".
            */}
            {!cost || !cost.available ? (
              <p className="text-muted-foreground">
                {job.tripId ? 'Loading…' : 'Not available until a trip is linked to this job.'}
              </p>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fuel</span>
                  <span className="font-medium">{formatDispatchCost(cost.fuelCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses</span>
                  <span className="font-medium">{formatDispatchCost(cost.expenseCost)}</span>
                </div>
                <div className="flex justify-between pt-2 font-semibold border-t border-border">
                  <span>Total</span>
                  <span>{formatDispatchCost(cost.totalCost)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AssignDispatchDialog
        open={assignDialogOpen}
        job={job}
        onOpenChange={setAssignDialogOpen}
        onSubmit={handleAssign}
        isSubmitting={assignJob.isPending}
      />

      <LinkTripDialog
        open={linkTripDialogOpen}
        job={job}
        onOpenChange={setLinkTripDialogOpen}
        onSubmit={handleLinkTrip}
        isSubmitting={linkTrip.isPending}
      />
    </div>
  );
}
