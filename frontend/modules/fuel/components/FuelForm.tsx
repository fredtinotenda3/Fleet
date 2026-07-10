// frontend/modules/fuel/components/FuelForm.tsx

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

const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'];
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid'];
const NO_STATION = '__none__';

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
};

export function FuelForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Log fuel entry',
  readOnly = false,
}: FuelFormProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data: volumeUnits } = useFuelVolumeUnits();
  const { data: stations } = useFuelStationsList({ isActive: true });
  const { data: cards } = useFuelCardsList({ status: 'active' });
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
    resolver: zodResolver(fuelFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const paymentMethod = watch('payment_method');
  const receiptUrl = watch('receipt_url');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const numericFieldOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  };

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
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="license_plate" className="w-full"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles?.data?.map((v) => (
                    <SelectItem key={v._id} value={v.license_plate}>{v.license_plate} - {v.make} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
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
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="unit_id" className="w-full"><SelectValue placeholder="Select unit" /></SelectTrigger>
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
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="payment_method" className="w-full"><SelectValue placeholder="Payment method" /></SelectTrigger>
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
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger id="fuel_card_id" className="w-full"><SelectValue placeholder="Select fuel card" /></SelectTrigger>
                  <SelectContent>
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
          <Label htmlFor="fuel_station_id" className="form-label">Fuel station</Label>
          <Controller
            control={control}
            name="fuel_station_id"
            render={({ field }) => (
              <Select
                value={field.value || NO_STATION}
                onValueChange={(v) => field.onChange(v === NO_STATION ? '' : v)}
                disabled={readOnly}
              >
                <SelectTrigger id="fuel_station_id" className="w-full"><SelectValue placeholder="Select a registered station" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATION}>Not registered / other</SelectItem>
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
        <Label htmlFor="is_full_tank" className="form-label !mb-0">Full tank fill-up</Label>
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