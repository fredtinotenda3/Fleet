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
  /** Seeds a NEW log only; an existing log keeps its own attribution. */
  defaultDriverId?: string;
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
  defaultLicensePlate?: string,
  defaultDriverId?: string
): Partial<FuelFormValues> | undefined {
  if (!log) {
    /*
      A NEW log opened from a vehicle's own page. Seeding the plate and
      the vehicle's currently-assigned driver removes the two fields the
      operator would otherwise re-enter for a vehicle they are already
      looking at.

      This seeds the CREATE path only. Editing an existing log returns
      that log's own `driver_id` below, untouched -- a historical
      attribution is never rewritten to the vehicle's current driver.
      That distinction is the whole point of the fuel-driver fix: the
      chart must show the driver on the log, not the driver on the
      vehicle today.
    */
    const seeded: Partial<FuelFormValues> = {};
    if (defaultLicensePlate) seeded.license_plate = defaultLicensePlate;
    if (defaultDriverId) seeded.driver_id = defaultDriverId;
    return Object.keys(seeded).length > 0 ? seeded : undefined;
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
    // NEW: falls back to '' (Unassigned) for legacy records with no driver.
    driver_id: log.driver_id ?? '',
  };
}

export function FuelModal({
  open,
  mode,
  fuelLog,
  defaultLicensePlate,
  defaultDriverId,
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
          // modal reopened for a different vehicle or driver starts clean.
          key={`${mode}-${fuelLog?._id ?? `${defaultLicensePlate ?? 'new'}:${defaultDriverId ?? ''}`}`}
          defaultValues={toFormValues(fuelLog, defaultLicensePlate, defaultDriverId)}
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