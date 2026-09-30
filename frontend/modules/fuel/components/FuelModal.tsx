// frontend/modules/fuel/components/FuelModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { FuelForm } from './FuelForm';
import type { FuelLog } from '../types';
import type { FuelFormValues } from '../schemas';

export type FuelModalMode = 'create' | 'edit' | 'view';

interface FuelModalProps {
  open: boolean;
  mode: FuelModalMode;
  fuelLog?: FuelLog | null;
  /**
   * Pre-selects the vehicle when creating.
   *
   * Mirrors ExpenseModal, which has had this since the vehicle expense
   * history page was built. Without it, an "Add fuel" action opened from
   * a vehicle's own page presents an empty vehicle picker and asks the
   * operator to find, in a list of every vehicle in the fleet, the one
   * whose page they are already standing on.
   *
   * Prefilled, NOT locked: the picker stays editable so a wrong turn is
   * correctable in place. The dialog title names the vehicle so the
   * default is never silent.
   */
  defaultLicensePlate?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FuelFormValues) => Promise<unknown>;
}

const TITLES: Record<FuelModalMode, string> = {
  create: 'Log fuel entry',
  edit: 'Edit fuel entry',
  view: 'Fuel entry details',
};

const DESCRIPTIONS: Record<FuelModalMode, string> = {
  create: 'Record a new fuel purchase.',
  edit: "Update this fuel entry's details.",
  view: 'View fuel entry details.',
};

function toFormValues(
  log: FuelLog | null | undefined,
  defaultLicensePlate?: string
): Partial<FuelFormValues> | undefined {
  if (!log) {
    /*
      A NEW log opened from a vehicle's own page. Seeding the plate
      removes a field the operator would otherwise re-enter for a
      vehicle they are already looking at.

      FIX (driver assignment must live only on the Vehicle Operational
      Hub): this used to also seed the vehicle's currently-assigned
      driver onto driver_id, on the reasoning that it saved a field the
      operator would otherwise retype. That reasoning doesn't hold under
      this fix: `driver_id` is a fuel log's own transaction-time
      attribution (who actually fuelled it that day), never the
      vehicle's assignment, and the form no longer exposes it at all
      (see FuelForm.tsx) -- so there is nothing left here to seed, and
      doing so invisibly would silently stamp the vehicle's current
      driver onto every new log's stored driver_id, which is the exact
      coupling this fix removes. driver_id is simply omitted from the
      create payload now; see create-fuel-log.handler.ts, which already
      treats it as fully optional.
    */
    return defaultLicensePlate ? { license_plate: defaultLicensePlate } : undefined;
  }
  return {
    license_plate: log.license_plate,
    unit_id: log.unit_id,
    date: new Date(log.date),
    fuel_volume: log.fuel_volume,
    cost: log.cost,
    currency: log.currency ?? 'USD',
    odometer: log.odometer,
    is_full_tank: log.is_full_tank ?? false,
    station_name: log.station_name ?? '',
    fuel_station_id: log.fuel_station_id ?? '',
    fuel_type: log.fuel_type ?? '',
    notes: log.notes ?? '',
    receipt_url: log.receipt_url ?? '',
    payment_method: log.payment_method ?? 'cash',
    fuel_card_id: log.fuel_card_id ?? '',
    // Deliberately NOT seeded here: driver_id is no longer editable via
    // this form (see FuelForm.tsx), and UpdateFuelLogHandler skips any
    // field that arrives as `undefined` rather than clearing it -- so
    // omitting the key leaves this log's existing driver_id (its own
    // historical transaction-time attribution) untouched by an edit
    // that never intended to touch it.
  };
}

export function FuelModal({
  open,
  mode,
  fuelLog,
  defaultLicensePlate,
  onOpenChange,
  onSubmit,
}: FuelModalProps) {
  const readOnly = mode === 'view';
  const title =
    mode === 'create' && defaultLicensePlate
      ? `Log fuel for ${defaultLicensePlate}`
      : TITLES[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <FuelForm
          // Remounts the form when the seeded context changes, so a
          // modal reopened for a different vehicle starts clean.
          key={`${mode}-${fuelLog?._id ?? `${defaultLicensePlate ?? 'new'}`}`}
          defaultValues={toFormValues(fuelLog, defaultLicensePlate)}
          onSubmit={async (values) => {
            await onSubmit(values);
            if (mode !== 'view') onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Log fuel entry'}
          readOnly={readOnly}
        />
      </DialogContent>
    </Dialog>
  );
}