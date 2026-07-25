'use client';

import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip, X } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { fuelFormSchema, type FuelFormValues } from '../schemas';
import { PAYMENT_METHOD_LABELS, FUEL_PAYMENT_METHODS } from '../types';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useFuelVolumeUnits } from '../hooks/useFuel';
import { useUploadReceipt } from '../hooks/useFuelMutations';
import { useFuelStationsList } from '@/frontend/modules/fuel-stations/hooks/useFuelStations';
import { useFuelCardsList } from '@/frontend/modules/fuel-cards/hooks/useFuelCards';
import { useDriversList } from '@/frontend/modules/drivers/hooks/useDrivers';
import { TripSelect } from '@/frontend/modules/trips/components/TripSelect';

const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'];
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid'];
const NO_STATION = '__none__';
const NO_DRIVER = '__unassigned__';
const NO_CARD = '__no_card__';

interface FuelFormProps {
  defaultValues?: Partial<FuelFormValues>;
  onSubmit: (values: FuelFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
  readOnly?: boolean;
}

const FALLBACK_DEFAULTS: FuelFormValues = {
  license_plate: '',
  unit_id: '',
  date: new Date(),
  fuel_volume: 0,
  cost: 0,
  currency: 'USD',
  odometer: 0,
  is_full_tank: false,
  station_name: '',
  fuel_station_id: '',
  fuel_type: '',
  notes: '',
  receipt_url: '',
  payment_method: 'cash',
  fuel_card_id: '',
  driver_id: '',
  tripId: '',
};

/**
 * Fields that are always supposed to hold a bare id/string, never a
 * whole record. Used by normalizeId() below as a defensive guard.
 */
const ID_FIELDS = new Set<keyof FuelFormValues>([
  'license_plate',
  'unit_id',
  'payment_method',
  'fuel_card_id',
  'driver_id',
  'fuel_station_id',
]);

/**
 * FIX ("fuel station renders, but selecting it turns into an object" /
 * general defensiveness for every id-backed Select in this form): if an
 * incoming record ever hands this form an embedded sub-document
 * (e.g. `{ _id, name }`) instead of a bare id string for one of the
 * ID_FIELDS above -- which can happen wherever a backend enrichment
 * step attaches a resolved object alongside the raw id field -- a
 * Select bound directly to that value has nothing to compare against
 * its string-valued <SelectItem>s and effectively "loses" the field
 * (or, if forced into text, prints [object Object]). This coerces any
 * such value down to its id string before it ever reaches RHF/the
 * Select, so the field always resolves through the normal picker flow.
 */
function normalizeId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)._id);
  }
  return String(value);
}

/**
 * FIX ("Unassigned" / blank fields on edit): real tblfuellogs documents
 * commonly store `payment_method: null`, `fuel_card_id: null`,
 * `odometer: null`, etc. rather than omitting those keys. A plain
 * `{ ...FALLBACK_DEFAULTS, ...defaultValues }` spread does NOT skip
 * explicit `null`/`undefined`, so a real record's `payment_method: null`
 * overwrote FALLBACK_DEFAULTS' `'cash'` with `null`. Strips null/undefined
 * out of the incoming record before merging, and normalizes any
 * id-shaped field through normalizeId() at the same time.
 */
function cleanDefaults(values?: Partial<FuelFormValues>): Partial<FuelFormValues> {
  if (!values) return {};
  const out: Partial<FuelFormValues> = {};
  (Object.keys(values) as Array<keyof FuelFormValues>).forEach((key) => {
    const v = values[key];
    if (v !== null && v !== undefined) {
      (out as any)[key] = ID_FIELDS.has(key) ? normalizeId(v) : v;
    }
  });
  return out;
}

export function FuelForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Log fuel entry',
  readOnly = false,
}: FuelFormProps) {
  const { data: vehicles, isLoading: vehiclesLoading } = useVehiclesList({ limit: 1000 });
  const { data: volumeUnits, isLoading: unitsLoading } = useFuelVolumeUnits();
  const { data: stations, isLoading: stationsLoading } = useFuelStationsList({ isActive: true });
  const { data: cards, isLoading: cardsLoading } = useFuelCardsList({ status: 'active' });
  /**
   * FIX (driver never renders / never resolves on edit): real tbldrivers
   * documents in this tenant do NOT carry a `status` field at all
   * (confirmed from a live document) -- only `name`, `driver_code`,
   * `isDeleted`. Filtering this picker by `status: 'active'` therefore
   * matches zero drivers server-side, so the dropdown is always empty
   * and an existing fuel log's `driver_id` can never be resolved to a
   * name. Drop the status filter for this picker; `limit: 1000` (now
   * actually honored -- see pagination.utils.ts) still bounds it.
   */
  const { data: drivers, isLoading: driversLoading } = useDriversList({ limit: 1000 });
  const uploadReceipt = useUploadReceipt();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FuelFormValues>({
    // Type casting the resolver is necessary because ZodEffects (.refine) inference 
    // can break RHF's generic constraints. Form values remain fully strictly-typed.
    resolver: zodResolver(fuelFormSchema) as any,
    defaultValues: { ...FALLBACK_DEFAULTS, ...cleanDefaults(defaultValues) },
  });

  const paymentMethod = watch('payment_method');
  const receiptUrl = watch('receipt_url');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const numericFieldOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  };

  /**
   * This app's <Select> is built on @base-ui/react/select, not Radix.
   * Base UI's <Select.Value> does NOT automatically resolve the current
   * `value` against the mounted <Select.Item>s to find a display label
   * -- it renders the raw `value` verbatim unless you pass it a
   * children render-function that maps value -> label yourself. Every
   * Select here that's keyed by an id (license_plate, unit_id,
   * payment_method, fuel_card_id, driver_id, fuel_station_id) does that
   * explicitly. `value` is run through normalizeId() first as a
   * belt-and-braces guard against the object-leak bug described above.
   */
  function getVehicleLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value) return vehiclesLoading ? 'Loading vehicles…' : 'Select vehicle';
    const match = vehicles?.data?.find((v) => v.license_plate === value);
    return match ? `${match.license_plate} - ${match.make} ${match.model}` : value;
  }

  function getUnitLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value) return unitsLoading ? 'Loading units…' : 'Select unit';
    const match = volumeUnits?.find((u) => u.unit_id === value);
    return match ? `${match.name} (${match.symbol})` : value;
  }

  function getPaymentMethodLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value) return 'Payment method';
    return PAYMENT_METHOD_LABELS[value as keyof typeof PAYMENT_METHOD_LABELS] ?? value;
  }

  function getCardLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value || value === NO_CARD) return 'No card selected';
    const match = cards?.data?.find((c) => c._id === value);
    return match ? `${match.provider} •••• ${match.card_last4}` : cardsLoading ? 'Loading cards…' : value;
  }

  function getDriverLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value || value === NO_DRIVER) return 'Unassigned';
    const match = drivers?.data?.find((d) => d._id === value);
    return match ? match.name : driversLoading ? 'Loading drivers…' : 'Unassigned';
  }

  function getStationLabel(rawValue: string | null | undefined): string {
    const value = normalizeId(rawValue);
    if (!value || value === NO_STATION) return 'Not registered / other';
    const match = stations?.data?.find((s) => s._id === value);
    if (match) return match.brand ? `${match.name} (${match.brand})` : match.name;
    return stationsLoading ? 'Loading stations…' : 'Not registered / other';
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadReceipt.mutateAsync(file);
      setValue('receipt_url', result.url, { shouldValidate: true, shouldDirty: true });
      setUploadedName(file.name);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="license_plate" className="form-label form-required">License plate</Label>
          <Controller
            control={control}
            name="license_plate"
            render={({ field }) => (
              <Select
                value={normalizeId(field.value)}
                onValueChange={(v) => field.onChange(normalizeId(v))}
                disabled={readOnly}
              >
                <SelectTrigger id="license_plate" className="w-full">
                  <SelectValue placeholder="Select vehicle">
                    {(value: string) => getVehicleLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vehiclesLoading && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading vehicles…</div>
                  )}
                  {vehicles?.data?.map((v) => (
                    <SelectItem key={v._id} value={v.license_plate}>{v.license_plate} - {v.make} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
          {!vehiclesLoading && (vehicles?.data?.length ?? 0) > 0 && (
            <p className="mt-1 text-caption text-muted-foreground">{vehicles?.data?.length} vehicles loaded</p>
          )}
        </div>

        <div>
          <Label htmlFor="date" className="form-label form-required">Date</Label>
          <Input
            id="date"
            type="date"
            disabled={readOnly}
            className={errors.date ? 'input-error' : undefined}
            defaultValue={
              defaultValues?.date instanceof Date
                ? defaultValues.date.toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10)
            }
            {...register('date', { setValueAs: (v) => (v ? new Date(v) : new Date()) })}
          />
          {errors.date && <p className="form-error" role="alert">{String(errors.date.message)}</p>}
        </div>

        <div>
          <Label htmlFor="fuel_volume" className="form-label form-required">Volume</Label>
          <Input
            id="fuel_volume"
            type="number"
            step="0.01"
            disabled={readOnly}
            className={errors.fuel_volume ? 'input-error' : undefined}
            {...register('fuel_volume', numericFieldOptions)}
          />
          {errors.fuel_volume && <p className="form-error" role="alert">{errors.fuel_volume.message}</p>}
        </div>

        <div>
          <Label htmlFor="unit_id" className="form-label form-required">Volume unit</Label>
          <Controller
            control={control}
            name="unit_id"
            render={({ field }) => (
              <Select
                value={normalizeId(field.value)}
                onValueChange={(v) => field.onChange(normalizeId(v))}
                disabled={readOnly}
              >
                <SelectTrigger id="unit_id" className="w-full">
                  <SelectValue placeholder="Select unit">
                    {(value: string) => getUnitLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {volumeUnits?.map((u) => (
                    <SelectItem key={u.unit_id} value={u.unit_id}>{u.name} ({u.symbol})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unit_id && <p className="form-error" role="alert">{errors.unit_id.message}</p>}
        </div>

        <div>
          <Label htmlFor="cost" className="form-label form-required">Cost</Label>
          <Input
            id="cost"
            type="number"
            step="0.01"
            disabled={readOnly}
            className={errors.cost ? 'input-error' : undefined}
            {...register('cost', numericFieldOptions)}
          />
          {errors.cost && <p className="form-error" role="alert">{errors.cost.message}</p>}
        </div>

        <div>
          <Label htmlFor="currency" className="form-label form-required">Currency</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="currency" className="w-full"><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="payment_method" className="form-label form-required">Payment method</Label>
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <Select
                value={normalizeId(field.value) || 'cash'}
                onValueChange={(v) => field.onChange(normalizeId(v))}
                disabled={readOnly}
              >
                <SelectTrigger id="payment_method" className="w-full">
                  <SelectValue placeholder="Payment method">
                    {(value: string) => getPaymentMethodLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FUEL_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {paymentMethod === 'fuel_card' && (
          <div>
            <Label htmlFor="fuel_card_id" className="form-label form-required">Fuel card</Label>
            <Controller
              control={control}
              name="fuel_card_id"
              render={({ field }) => (
                <Select
                  value={normalizeId(field.value) || NO_CARD}
                  onValueChange={(v) => field.onChange(v === NO_CARD ? '' : normalizeId(v))}
                  disabled={readOnly}
                >
                  <SelectTrigger id="fuel_card_id" className="w-full">
                    <SelectValue placeholder="Select fuel card">
                      {(value: string) => getCardLabel(value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CARD}>No card selected</SelectItem>
                    {cards?.data?.map((c) => (
                      <SelectItem key={c._id} value={c._id!}>
                        {c.provider} •••• {c.card_last4}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.fuel_card_id && <p className="form-error" role="alert">{errors.fuel_card_id.message}</p>}
          </div>
        )}

        <div>
          <Label htmlFor="odometer" className="form-label">Odometer (km)</Label>
          <Input
            id="odometer"
            type="number"
            step="1"
            disabled={readOnly}
            className={errors.odometer ? 'input-error' : undefined}
            {...register('odometer', numericFieldOptions)}
          />
          {errors.odometer && <p className="form-error" role="alert">{errors.odometer.message}</p>}
        </div>

        <div>
          <Label htmlFor="driver_id" className="form-label">Driver</Label>
          <Controller
            control={control}
            name="driver_id"
            render={({ field }) => (
              <Select
                value={normalizeId(field.value) || NO_DRIVER}
                onValueChange={(v) => field.onChange(v === NO_DRIVER ? '' : normalizeId(v))}
                disabled={readOnly}
              >
                <SelectTrigger id="driver_id" className="w-full">
                  <SelectValue placeholder="Unassigned">
                    {(value: string) => getDriverLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DRIVER}>Unassigned</SelectItem>
                  {driversLoading && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading drivers…</div>
                  )}
                  {drivers?.data?.map((d) => (
                    <SelectItem key={d._id} value={d._id!}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.driver_id && <p className="form-error" role="alert">{String(errors.driver_id.message)}</p>}
        </div>

        <div>
          <Label htmlFor="fuel_station_id" className="form-label">Fuel station</Label>
          <Controller
            control={control}
            name="fuel_station_id"
            render={({ field }) => (
              <Select
                value={normalizeId(field.value) || NO_STATION}
                onValueChange={(v) => field.onChange(v === NO_STATION ? '' : normalizeId(v))}
                disabled={readOnly}
              >
                <SelectTrigger id="fuel_station_id" className="w-full">
                  <SelectValue placeholder="Select a registered station">
                    {(value: string) => getStationLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATION}>Not registered / other</SelectItem>
                  {stationsLoading && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading stations…</div>
                  )}
                  {stations?.data?.map((s) => (
                    <SelectItem key={s._id} value={s._id!}>{s.name}{s.brand ? ` (${s.brand})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="station_name" className="form-label">Station name (if not listed)</Label>
          <Input id="station_name" placeholder="e.g. Total Borrowdale" disabled={readOnly} {...register('station_name')} />
        </div>

        <div>
          <Label htmlFor="fuel_type" className="form-label">Fuel type</Label>
          <Controller
            control={control}
            name="fuel_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="fuel_type" className="w-full"><SelectValue placeholder="Select fuel type" /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="is_full_tank"
          render={({ field }) => (
            <Checkbox id="is_full_tank" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />
          )}
        />
        <Label htmlFor="is_full_tank" className="form-label mb-0!">Full tank fill-up</Label>
      </div>

      <div>
        <Label className="form-label">Receipt</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || uploadReceipt.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadReceipt.isPending ? <Spinner className="w-3.5 h-3.5 mr-1.5" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />}
            {uploadReceipt.isPending ? 'Uploading...' : 'Attach receipt'}
          </Button>
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
              {uploadedName || 'View attached receipt'}
            </a>
          )}
          {receiptUrl && !readOnly && (
            <button
              type="button"
              onClick={() => setValue('receipt_url', '', { shouldDirty: true })}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove receipt"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {errors.receipt_url && <p className="form-error" role="alert">{String(errors.receipt_url.message)}</p>}
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={3} disabled={readOnly} {...register('notes')} />
      </div>

      <div>
        <Label htmlFor="tripId" className="form-label">Link to trip (optional)</Label>
        <Controller
          control={control}
          name="tripId"
          render={({ field }) => (
            <TripSelect
              licensePlate={watch('license_plate')}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}