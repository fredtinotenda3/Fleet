// frontend/modules/vehicles/components/DriverAssignmentPanel.tsx
//
// Wired to real hooks/services (useAssignVehicleDriver ->
// vehiclesApi.assignDriver -> PATCH /api/vehicles/:id/driver). That route
// is implemented server-side (see vehicleController.assignVehicleDriver
// and docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md for the design
// record) -- "Assign"/"Unassign" round-trip to the server for real.

'use client';

import { useState } from 'react';
import { UserRound, UserRoundPlus, UserRoundX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/frontend/shared/ui/feedback/dialog';
import { DriverSelect } from '@/frontend/modules/drivers/components/DriverSelect';
import { useAssignVehicleDriver } from '../hooks/useVehicleMutations';
import { formatDriverAssignmentStatus } from '../utils';
import type { VehicleWithAssignment } from '../types';

interface DriverAssignmentPanelProps {
  vehicle: VehicleWithAssignment;
  /** Gate on canAssignDriverToVehicle(roles) from frontend/modules/drivers/utils. */
  canAssign: boolean;
}

export function DriverAssignmentPanel({ vehicle, canAssign }: DriverAssignmentPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const assignDriver = useAssignVehicleDriver(vehicle._id!);

  const status = formatDriverAssignmentStatus(vehicle.assignedDriver ?? null);

  function openAssignDialog() {
    setSelectedDriverId(vehicle.assignedDriver?._id ?? '');
    setDialogOpen(true);
  }

  async function handleSave() {
    await assignDriver.mutateAsync({ driverId: selectedDriverId || null });
    setDialogOpen(false);
  }

  async function handleUnassign() {
    await assignDriver.mutateAsync({ driverId: null });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver assignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-body-sm text-foreground">{status.label}</p>
              {status.detail && <p className="text-caption text-muted-foreground">{status.detail}</p>}
            </div>
          </div>

          {canAssign && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openAssignDialog} disabled={assignDriver.isPending}>
                <UserRoundPlus className="h-3.5 w-3.5" />
                {status.assigned ? 'Change driver' : 'Assign driver'}
              </Button>
              {status.assigned && (
                <Button size="sm" variant="ghost" onClick={handleUnassign} disabled={assignDriver.isPending}>
                  <UserRoundX className="h-3.5 w-3.5" />
                  Unassign
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{status.assigned ? 'Change driver' : 'Assign driver'}</DialogTitle>
            <DialogDescription>
              Choose a driver to assign to {vehicle.license_plate}.
            </DialogDescription>
          </DialogHeader>

          <DriverSelect value={selectedDriverId} onChange={setSelectedDriverId} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={assignDriver.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
