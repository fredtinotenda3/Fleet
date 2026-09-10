// frontend/modules/workorders/components/WorkOrderForm.tsx
//
// The first manual work-order create flow in this product.
//
// ---------------------------------------------------------------------
// WHY IT DID NOT EXIST
// ---------------------------------------------------------------------
// Work orders have always arrived from somewhere else: a DVIR defect, a
// maintenance reminder, or an attention item dispatched from the Command
// Centre. `WorkOrderTable` even documents the gap on its own `onCreate`
// prop -- "this module has no manual create flow", so the list page's
// empty state omits the button.
//
// That is fine as an ORIGIN story and wrong as a product. A workshop
// manager standing in front of a truck with a cracked mirror has nowhere
// to record the job unless someone first raises a reminder for it. So
// the create endpoint (`POST /api/workorders`, `WORKORDER_CREATE`) has
// shipped and been reachable only by other code.
//
// Deliberately small, matching `WorkOrderCreateDTO` exactly:
// license_plate, title, description?, priority?. Parts, labour, bay and
// mechanic are NOT here -- those are assignment and completion concerns
// with their own permission-gated flows (AssignMechanicDialog,
// WorkOrderStatusActions), and duplicating them into the create form
// would let someone book costs against a job nobody has started.

'use client';

import { useForm, Controller } from 'react-hook-form';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '@/frontend/modules/vehicles';
import type { WorkOrderCreateDTO } from '../types';

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

interface WorkOrderFormValues {
  license_plate: string;
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
}

interface WorkOrderFormProps {
  /** Pre-selects the vehicle. See FuelModal for the rationale. */
  defaultLicensePlate?: string;
  onSubmit: (values: WorkOrderCreateDTO) => Promise<unknown>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function WorkOrderForm({
  defaultLicensePlate,
  onSubmit,
  onCancel,
  isSubmitting,
}: WorkOrderFormProps) {
  const { data: vehiclesResult } = useVehiclesList({ page: 1, limit: 200 });
  const vehicles = vehiclesResult?.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    defaultValues: {
      license_plate: defaultLicensePlate ?? '',
      title: '',
      description: '',
      // 'medium' rather than nothing: WorkOrderCreateDTO makes priority
      // optional and the server defaults it, but leaving the control
      // blank invites a workshop to treat "unset" as a fifth priority.
      priority: 'medium',
    },
  });

  async function handleFormSubmit(values: WorkOrderFormValues) {
    await onSubmit({
      license_plate: values.license_plate,
      title: values.title.trim(),
      // Empty strings are omitted rather than stored: a description of
      // "" is not a description, and it renders as an empty line on the
      // work order.
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      priority: values.priority,
    });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wo-license-plate">Vehicle *</Label>
          <Controller
            control={control}
            name="license_plate"
            rules={{ required: 'Vehicle is required' }}
            render={({ field }) => (
              <Select value={field.value || ''} onValueChange={(v) => field.onChange(v ?? '')}>
                <SelectTrigger id="wo-license-plate" className="w-full">
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v._id} value={v.license_plate}>
                      {v.license_plate} — {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.license_plate && (
            <p className="text-xs text-destructive" role="alert">
              {errors.license_plate.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wo-priority">Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange((v as WorkOrderFormValues['priority']) ?? 'medium')}
              >
                <SelectTrigger id="wo-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wo-title">What needs doing? *</Label>
        <Input
          id="wo-title"
          placeholder="Replace nearside mirror"
          {...register('title', {
            required: 'A short description of the job is required',
            maxLength: { value: 200, message: 'Keep the summary under 200 characters' },
          })}
        />
        {errors.title && (
          <p className="text-xs text-destructive" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wo-description">Details</Label>
        <Textarea
          id="wo-description"
          rows={4}
          placeholder="Anything the mechanic needs to know before starting."
          {...register('description', {
            maxLength: { value: 2000, message: 'Keep the details under 2000 characters' },
          })}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create work order'}
        </Button>
      </div>
    </form>
  );
}
