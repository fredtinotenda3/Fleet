// frontend/modules/vehicles/components/VehicleSelect.tsx
//
// Reusable vehicle picker, keyed by vehicle `_id` (not `license_plate`)
// -- mirrors DriverSelect.tsx's convention exactly, but most other
// vehicle pickers in this codebase (WorkOrderForm, FuelForm) key by
// plate instead, because their target entity (WorkOrder.license_plate,
// Fuel.license_plate) stores the plate as its own FK. Dispatch's
// assign() endpoint takes `vehicleId` (an _id), the same way it takes
// `driverId` rather than a driver code, so this needed its own
// id-keyed picker rather than reusing one of the plate-keyed forms.
//
// ROUND 4 (Dispatch <-> Trip/Vehicle/Driver): built for
// AssignDispatchForm. No equivalent reusable, id-keyed vehicle select
// existed before this -- confirmed by inspecting WorkOrderForm/FuelForm,
// both of which inline a plate-keyed <Select> directly rather than a
// shared component.

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '../hooks/useVehicles';

const UNASSIGNED = '__unassigned__';

interface VehicleSelectProps {
  value?: string;
  onChange: (vehicleId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Show an explicit "Unassigned" option that clears the value. Default true. */
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  /** Restrict the fleet to status === 'active'. Default true. */
  activeOnly?: boolean;
  id?: string;
}

export function VehicleSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Select vehicle',
  allowUnassigned = true,
  unassignedLabel = 'Unassigned',
  activeOnly = true,
  id = 'vehicle_id',
}: VehicleSelectProps) {
  const { data: vehicles, isLoading } = useVehiclesList({
    status: activeOnly ? 'active' : undefined,
    limit: 1000,
  });

  return (
    <Select
      value={value || (allowUnassigned ? UNASSIGNED : '')}
      onValueChange={(v) => onChange(!v || v === UNASSIGNED ? '' : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={isLoading ? 'Loading vehicles…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowUnassigned && <SelectItem value={UNASSIGNED}>{unassignedLabel}</SelectItem>}
        {vehicles?.data?.map((v) => (
          <SelectItem key={v._id} value={v._id!}>
            {v.license_plate}
            {v.make || v.model ? ` (${[v.make, v.model].filter(Boolean).join(' ')})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
