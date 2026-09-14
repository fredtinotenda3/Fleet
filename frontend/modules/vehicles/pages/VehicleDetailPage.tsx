//frontend/modules/vehicles/pages/VehicleDetailPage.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Copy } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicle } from '../hooks/useVehicles';
import { useDeleteVehicle, useUpdateVehicle } from '../hooks/useVehicleMutations';
import { VehicleModal, type VehicleModalMode } from '../components/VehicleModal';
import { VehicleAnalyticsPanel } from '../components/analytics';
import { DriverAssignmentPanel } from '../components/DriverAssignmentPanel';
import { VehicleQuickActions } from '../components/operations/VehicleQuickActions';
import { VehicleActivityTimeline } from '../components/operations/VehicleActivityTimeline';
import { VehicleCostsPanel } from '@/frontend/modules/finance/components/VehicleCostsPanel';
import { canAssignDriverToVehicle } from '@/frontend/modules/drivers/utils';
import {
  getVehicleStatusMeta,
  getVehicleStatusBadgeClass,
  vehicleDisplayName,
  isRegistrationExpired,
  isRegistrationExpiringSoon,
  canManageVehicles,
  canDeleteVehicles,
} from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { VEHICLE_ROUTES } from '../routes';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import { EXPENSE_ROUTES } from '@/frontend/modules/expenses/routes';
import { MAINTENANCE_ROUTES } from '@/frontend/modules/maintenance/routes';
import { WORKORDER_ROUTES } from '@/frontend/modules/workorders/routes';
import type { VehicleFormValues } from '../schemas';
import type { VehicleStatus } from '../types';
import { cn } from '@/lib/utils';
import { VehicleInstrumentCluster } from '../components/operations/VehicleInstrumentCluster';

interface VehicleDetailPageProps {
  vehicleId: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function VehicleDetailPage({ vehicleId }: VehicleDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageVehicles(roles);
  const canDelete = canDeleteVehicles(roles);
  const canAssignDriver = canAssignDriverToVehicle(roles);

  const { data: vehicle, isLoading, isError } = useVehicle(vehicleId);
  const deleteVehicle = useDeleteVehicle();
  const updateVehicle = useUpdateVehicle(vehicleId);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [modalMode, setModalMode] = useState<VehicleModalMode>('edit');

  if (isLoading) return <PageLoader label="Loading vehicle" />;

  if (isError || !vehicle) {
    return (
      <EmptyState
        title="Vehicle not found"
        description="This vehicle may have been removed or you don't have access to it."
        action={{ label: 'Back to vehicles', onClick: () => router.push(VEHICLE_ROUTES.list) }}
      />
    );
  }

  const statusMeta = getVehicleStatusMeta(vehicle.status);
  const registrationExpired = isRegistrationExpired(vehicle.registration_expiry);
  const registrationExpiringSoon = isRegistrationExpiringSoon(vehicle.registration_expiry);

  async function handleDelete() {
    if (!window.confirm(`Delete ${vehicle!.license_plate}?`)) return;
    await deleteVehicle.mutateAsync({ id: vehicleId, soft: true });
    router.push(VEHICLE_ROUTES.list);
  }

  async function handleSubmit(values: VehicleFormValues) {
    await updateVehicle.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={vehicleDisplayName(vehicle)}
        description={`License plate: ${vehicle.license_plate}`}
        breadcrumbs={[{ label: 'Vehicles', href: VEHICLE_ROUTES.list }, { label: vehicle.license_plate }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(VEHICLE_ROUTES.list)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setModalMode('duplicate');
                  setModalOpen(true);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setModalMode('edit');
                  setModalOpen(true);
                }}
              >
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
        <span className={cn('badge-status', getVehicleStatusBadgeClass(vehicle.status as VehicleStatus))}>
          {statusMeta.label}
        </span>
        {registrationExpired && <Badge variant="destructive">Registration expired</Badge>}
        {!registrationExpired && registrationExpiringSoon && (
          <Badge variant="outline" className="border-warning text-warning">
            Registration expiring soon
          </Badge>
        )}
      </div>

      {/*
        The operational surface. Each button opens its own module's modal
        with this vehicle pre-selected, submits through that module's own
        mutation, and is gated on the permission that module's endpoint
        actually enforces -- see VehicleQuickActions.
      */}
      <VehicleQuickActions
        licensePlate={vehicle.license_plate}
        vehicleId={vehicle._id}
        /*
          The assigned driver was already on this record (rendered in the
          Driver tab) and was not passed to the forms opened from this
          same page, so every one of them started with an empty driver
          field for a vehicle whose driver the page was displaying.
        */
        currentDriverId={vehicle.assignedDriver?._id ?? undefined}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value ?? 'overview')}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="specifications">Specifications</TabsTrigger>
          <TabsTrigger value="driver">Driver</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/*
            LIVE STATE, first on the page.

            §4.1's requirement, and the answer to "what is this vehicle
            doing right now" -- which the hub could not answer at all:
            it imported nothing from telematics, so a page about one
            vehicle showed no position, no speed, no ignition and no
            freshness.

            The cluster is vehicle-scoped by construction. It calls the
            per-vehicle endpoint that already existed and was only ever
            used by the fleet map, rather than the fleet-wide list the
            live-map page uses -- pulling every vehicle's telemetry to
            render one is what §12.3 rules out for this screen.
          */}
          {/*
            Guarded rather than made optional on the component: a vehicle
            fetched BY ID always has one, so an absent `_id` here is a
            data fault, not an untracked vehicle. Rendering the cluster's
            "no telemetry" state for it would blame the tracker for a
            problem with the record.
          */}
          {vehicle._id && (
            <VehicleInstrumentCluster
              vehicleId={vehicle._id}
              vehicleType={vehicle.vehicle_type}
              fuelType={vehicle.fuel_type}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Vehicle overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow label="Make" value={vehicle.make} />
                <DetailRow label="Model" value={vehicle.model} />
                <DetailRow label="Year" value={String(vehicle.year)} />
                <DetailRow label="Vehicle type" value={vehicle.vehicle_type} />
                <DetailRow label="Fuel type" value={vehicle.fuel_type} />
                <DetailRow label="Odometer" value={vehicle.odometer != null ? formatDistance(vehicle.odometer) : 'N/A'} />
                <DetailRow label="Purchase date" value={formatDate(vehicle.purchase_date)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Registration &amp; insurance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow label="VIN" value={vehicle.vin || 'Not recorded'} />
                <DetailRow
                  label="Registration expiry"
                  value={vehicle.registration_expiry ? formatDate(vehicle.registration_expiry) : 'Not recorded'}
                />
                <DetailRow label="Insurance provider" value={vehicle.insurance_provider || 'Not recorded'} />
                <DetailRow
                  label="Service interval"
                  value={vehicle.service_interval ? formatDistance(vehicle.service_interval) : 'Not set'}
                />
                <DetailRow
                  label="Last service"
                  value={vehicle.last_service_date ? formatDate(vehicle.last_service_date) : 'No service recorded'}
                />
              </CardContent>
            </Card>
          </div>

          {/*
            A glance at what has actually happened to this vehicle,
            reusing the Activity tab's queries so the two views share one
            cache entry rather than fetching the same records twice.
          */}
          {vehicle._id && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleActivityTimeline
                  vehicleId={vehicle._id}
                  licensePlate={vehicle.license_plate}
                  maxEntries={6}
                  footer={
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab('activity')}
                      >
                        See full history
                      </Button>
                      <Link
                        href={FUEL_ROUTES.vehicleHistory(vehicle.license_plate)}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Fuel history
                      </Link>
                      <Link
                        href={EXPENSE_ROUTES.vehicleHistory(vehicle.license_plate)}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Expense history
                      </Link>
                      <Link
                        href={MAINTENANCE_ROUTES.vehicleHistory(vehicle.license_plate)}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Maintenance history
                      </Link>
                      <Link
                        href={WORKORDER_ROUTES.byLicensePlate(vehicle.license_plate)}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Work orders
                      </Link>
                    </div>
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="specifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailRow label="License plate" value={vehicle.license_plate} />
              <DetailRow label="Make" value={vehicle.make} />
              <DetailRow label="Model" value={vehicle.model} />
              <DetailRow label="Year" value={String(vehicle.year)} />
              <DetailRow label="Type" value={vehicle.vehicle_type} />
              <DetailRow label="Fuel type" value={vehicle.fuel_type} />
              <DetailRow label="Color" value={vehicle.color || 'Not set'} />
              <DetailRow label="VIN" value={vehicle.vin || 'Not recorded'} />
              <DetailRow label="Status" value={statusMeta.label} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="driver" className="mt-4">
          <DriverAssignmentPanel vehicle={vehicle} canAssign={canAssignDriver} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <VehicleAnalyticsPanel licensePlate={vehicle.license_plate} />
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          {vehicle._id ? (
            <VehicleCostsPanel vehicleId={vehicle._id} />
          ) : (
            <p className="text-body-sm text-muted-foreground">Costs are unavailable for this vehicle.</p>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity history</CardTitle>
            </CardHeader>
            <CardContent>
              {/*
                This tab used to render the AUDIT LOG and nothing else, so a
                truck refuelled eleven times and serviced twice read
                "Vehicle updated / Vehicle created". The timeline merges the
                vehicle's own operational records with those record changes
                -- see VehicleActivityTimeline for the two rules it holds to
                (nothing fabricated; a failed fetch is never rendered as an
                empty history).
              */}
              {vehicle._id ? (
                <VehicleActivityTimeline
                  vehicleId={vehicle._id}
                  licensePlate={vehicle.license_plate}
                />
              ) : (
                <p className="text-body-sm text-muted-foreground">
                  Activity is unavailable for this vehicle.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <VehicleModal open={modalOpen} mode={modalMode} vehicle={vehicle} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}