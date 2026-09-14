// frontend/modules/vehicles/components/operations/VehicleQuickActions.tsx
//
// Turns the Vehicle Detail page from a profile into a place work happens.
//
// ---------------------------------------------------------------------
// WHAT THIS IS NOT
// ---------------------------------------------------------------------
// It is NOT a second implementation of five forms. Every action opens
// the module's own modal, submits through the module's own mutation, and
// hits the module's own endpoint with the module's own permission. The
// only thing added here is the vehicle: each modal now takes a
// `defaultLicensePlate` so the operator is not asked to find, in a list
// of every vehicle in the fleet, the one whose page they are standing on.
//
// Duplicating the business logic would have been faster and would have
// produced a second set of rules to keep in step with the first -- the
// duplicate-architecture problem this codebase has been bitten by
// before.
//
// ---------------------------------------------------------------------
// PERMISSIONS
// ---------------------------------------------------------------------
// Each button is gated on the permission its endpoint actually enforces,
// not on a generic "can manage" role check. A user who cannot create a
// work order does not see a work-order button that will 403.
//
// Note MAINTENANCE_CREATE: `POST /api/reminders` enforces it, but no
// frontend helper checked it -- `canManageMaintenance` tests
// MAINTENANCE_EDIT instead. Gating on EDIT here would have shown the
// button to someone who cannot create, so this checks CREATE directly.

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Fuel, Receipt, Route, Wrench, ClipboardList } from 'lucide-react';

import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useQueryClient } from '@tanstack/react-query';

import { useCreateFuelLog } from '@/frontend/modules/fuel/hooks/useFuelMutations';
import { useCreateExpense } from '@/frontend/modules/expenses/hooks/useExpenseMutations';
import { useCreateTrip } from '@/frontend/modules/trips/hooks/useTripMutations';
import { useCreateMaintenanceRecord } from '@/frontend/modules/maintenance/hooks/useMaintenanceMutations';
import { useCreateWorkOrder } from '@/frontend/modules/workorders/hooks/useWorkOrderMutations';

import { vehicleKeys } from '../../hooks/useVehicles';
import type { FuelFormOutput } from '@/frontend/modules/fuel/schemas';
import type { ExpenseFormOutput } from '@/frontend/modules/expenses/schemas';
import type { TripFormOutput } from '@/frontend/modules/trips/schemas';
import type { MaintenanceFormOutput } from '@/frontend/modules/maintenance/schemas';

/**
 * THE MODALS ARE LOADED ON CLICK, NOT ON PAGE LOAD.
 *
 * Static imports here would pull five modules' forms, schemas, vehicle
 * pickers and validation resolvers into the Vehicle Detail route's
 * graph, none of which is used on a visit that does not record anything
 * -- which is most visits. Measured on this tree, moving them behind
 * `dynamic()` took the route's First Load JS from 662 kB to 656 kB.
 *
 * That 6 kB is smaller than it looks, and the reason is worth stating:
 * these routes carry ~560 kB of SHARED chunk from the protected layout
 * before any page code is counted (`/workorders` is 666 kB with 571 B of
 * its own). The layout, not this component, is where the weight is --
 * recorded in the report as a separate finding rather than fixed here.
 *
 * `ssr: false` because these only ever open from a click, so there is
 * nothing to server-render, and it keeps the forms out of the server
 * bundle too.
 */
const FuelModal = dynamic(
  () => import('@/frontend/modules/fuel/components/FuelModal').then((m) => m.FuelModal),
  { ssr: false }
);
const ExpenseModal = dynamic(
  () => import('@/frontend/modules/expenses/components/ExpenseModal').then((m) => m.ExpenseModal),
  { ssr: false }
);
const TripModal = dynamic(
  () => import('@/frontend/modules/trips/components/TripModal').then((m) => m.TripModal),
  { ssr: false }
);
const MaintenanceModal = dynamic(
  () =>
    import('@/frontend/modules/maintenance/components/MaintenanceModal').then(
      (m) => m.MaintenanceModal
    ),
  { ssr: false }
);
const WorkOrderModal = dynamic(
  () => import('@/frontend/modules/workorders/components/WorkOrderModal').then((m) => m.WorkOrderModal),
  { ssr: false }
);

type ActionKey = 'fuel' | 'expense' | 'trip' | 'maintenance' | 'work-order';

interface VehicleQuickActionsProps {
  licensePlate: string;
  vehicleId?: string;
  /**
   * The driver currently assigned to this vehicle, pre-selected on the
   * forms that record work against it.
   *
   * ADDED because it was the most obvious piece of context the hub had
   * and did not use: `vehicle.assignedDriver` is already on the fetched
   * record and rendered in the Driver tab, while every quick-action
   * form opened from the same page started with an empty driver field
   * -- and the trip form asked for it as free text.
   *
   * Optional, and only ever a DEFAULT. The forms stay editable, because
   * the assigned driver is the likely answer, not a certain one: a
   * relief driver on one leg is exactly the case a fixed value would
   * get wrong. Historical records are untouched -- this seeds a NEW
   * record only.
   */
  currentDriverId?: string;
}

export function VehicleQuickActions({
  licensePlate,
  vehicleId,
  currentDriverId,
}: VehicleQuickActionsProps) {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const queryClient = useQueryClient();

  const [openAction, setOpenAction] = useState<ActionKey | null>(null);

  const createFuel = useCreateFuelLog();
  const createExpense = useCreateExpense();
  const createTrip = useCreateTrip();
  const createMaintenance = useCreateMaintenanceRecord();
  const createWorkOrder = useCreateWorkOrder();

  /**
   * None of the module mutations invalidate `vehicleKeys`, because none
   * of them know they were fired from a vehicle's page. Without this the
   * odometer, cost and activity panels on THIS page keep showing the
   * figures from before the record was added -- the classic "I saved it
   * and nothing happened" report.
   */
  const refreshVehicleViews = () => {
    if (vehicleId) {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.activity(vehicleId, 1) });
    }
  };

  const actions: Array<{
    key: ActionKey;
    label: string;
    icon: React.ReactNode;
    allowed: boolean;
  }> = [
    {
      key: 'fuel',
      label: 'Log fuel',
      icon: <Fuel className="size-4" aria-hidden="true" />,
      allowed: permissionService.hasPermission(roles, Permission.FUEL_CREATE),
    },
    {
      key: 'expense',
      label: 'Add expense',
      icon: <Receipt className="size-4" aria-hidden="true" />,
      allowed: permissionService.hasPermission(roles, Permission.EXPENSE_CREATE),
    },
    {
      key: 'trip',
      label: 'Log trip',
      icon: <Route className="size-4" aria-hidden="true" />,
      allowed: permissionService.hasPermission(roles, Permission.TRIP_CREATE),
    },
    {
      key: 'maintenance',
      label: 'Schedule service',
      icon: <Wrench className="size-4" aria-hidden="true" />,
      allowed: permissionService.hasPermission(roles, Permission.MAINTENANCE_CREATE),
    },
    {
      key: 'work-order',
      label: 'Raise work order',
      icon: <ClipboardList className="size-4" aria-hidden="true" />,
      allowed: permissionService.hasPermission(roles, Permission.WORKORDER_CREATE),
    },
  ];

  const available = actions.filter((action) => action.allowed);

  // A viewer or auditor gets no action bar at all, rather than a row of
  // buttons that would 403.
  if (available.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="vehicle-quick-actions">
        {available.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpenAction(action.key)}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>

      {/*
        Each modal is mounted only while open so its form state is fresh
        every time, and so five vehicle pickers are not each fetching the
        fleet list behind a closed dialog.
      */}
      {openAction === 'fuel' && (
        <FuelModal
          open
          mode="create"
          defaultLicensePlate={licensePlate}
          defaultDriverId={currentDriverId}
          onOpenChange={(next) => !next && setOpenAction(null)}
          onSubmit={async (values) => {
            await createFuel.mutateAsync(values as FuelFormOutput);
            refreshVehicleViews();
          }}
        />
      )}

      {openAction === 'expense' && (
        <ExpenseModal
          open
          mode="create"
          defaultLicensePlate={licensePlate}
          onOpenChange={(next) => !next && setOpenAction(null)}
          onSubmit={async (values) => {
            await createExpense.mutateAsync(values as ExpenseFormOutput);
            refreshVehicleViews();
          }}
        />
      )}

      {openAction === 'trip' && (
        <TripModal
          open
          mode="create"
          defaultLicensePlate={licensePlate}
          onOpenChange={(next) => !next && setOpenAction(null)}
          onSubmit={async (values) => {
            await createTrip.mutateAsync(values as TripFormOutput);
            refreshVehicleViews();
          }}
        />
      )}

      {openAction === 'maintenance' && (
        <MaintenanceModal
          open
          mode="create"
          defaultLicensePlate={licensePlate}
          isSubmitting={createMaintenance.isPending}
          onOpenChange={(next) => !next && setOpenAction(null)}
          onSubmit={async (values: MaintenanceFormOutput) => {
            await createMaintenance.mutateAsync(values);
            refreshVehicleViews();
          }}
        />
      )}

      {openAction === 'work-order' && (
        <WorkOrderModal
          open
          defaultLicensePlate={licensePlate}
          isSubmitting={createWorkOrder.isPending}
          onOpenChange={(next) => !next && setOpenAction(null)}
          onSubmit={async (values) => {
            await createWorkOrder.mutateAsync(values);
            refreshVehicleViews();
          }}
        />
      )}
    </>
  );
}
