//frontend/modules/vehicles/pages/VehicleDetailPage.tsx

'use client';

import { useState } from 'react';
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
import { useVehicle, useVehicleActivity } from '../hooks/useVehicles';
import { useDeleteVehicle, useUpdateVehicle } from '../hooks/useVehicleMutations';
import { VehicleModal, type VehicleModalMode } from '../components/VehicleModal';
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
import type { VehicleFormValues } from '../schemas';
import type { VehicleStatus } from '../types';
import { cn } from '@/lib/utils';

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

  const { data: vehicle, isLoading, isError } = useVehicle(vehicleId);
  const { data: activity, isLoading: activityLoading } = useVehicleActivity(vehicleId);
  const deleteVehicle = useDeleteVehicle();
  const updateVehicle = useUpdateVehicle(vehicleId);
  const [modalOpen, setModalOpen] = useState(false);
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="specifications">Specifications</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
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

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity history</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <p className="text-body-sm text-muted-foreground">Loading activity...</p>
              ) : !activity?.data?.length ? (
                <p className="text-body-sm text-muted-foreground">No recorded activity for this vehicle yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {activity.data.map((entry) => (
                    <li key={entry._id} className="flex items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium text-body-sm text-foreground">{entry.action}</p>
                        <p className="text-caption text-muted-foreground">
                          {formatDate(entry.createdAt ?? entry.recordedAt, 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <VehicleModal open={modalOpen} mode={modalMode} vehicle={vehicle} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}