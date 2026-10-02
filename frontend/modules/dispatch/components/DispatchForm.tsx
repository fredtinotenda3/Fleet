// frontend/modules/dispatch/components/DispatchForm.tsx
//
// Matches DispatchJobCreateDTO exactly: title, priority?, pickupLocation,
// dropoffLocation?, scheduledFor?, notes?, customerId?, jobReference?.
// Mirrors WorkOrderForm.tsx's structure.
//
// `customerId` is deliberately NOT a field here even though the backend
// DTO accepts and validates it (see dispatch.service.ts's create()) --
// there is no customer-picker UI anywhere in this codebase yet (no
// CustomerSelect component, no customers.api.ts client; confirmed by
// inspecting the frontend before building this form), and building one
// from scratch is a separate, customer-master-data feature, not a
// dispatch one. Adding a bare customerId text input would invite typos
// against a real foreign key with no way to pick a valid value, which is
// worse than omitting the field. `jobReference` (free text, same
// minimal-string convention as pickupLocation) is exposed instead --
// it needs no picker and gives the same "which job is this" context a
// dispatcher or customer's own PO number provides.

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
import type { DispatchJobCreateDTO } from '../types';

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

interface DispatchFormValues {
  title: string;
  priority: (typeof PRIORITIES)[number];
  pickupLocation: string;
  dropoffLocation: string;
  scheduledFor: string;
  jobReference: string;
  notes: string;
}

interface DispatchFormProps {
  onSubmit: (values: DispatchJobCreateDTO) => Promise<unknown>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function DispatchForm({ onSubmit, onCancel, isSubmitting }: DispatchFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DispatchFormValues>({
    defaultValues: {
      title: '',
      priority: 'medium',
      pickupLocation: '',
      dropoffLocation: '',
      scheduledFor: '',
      jobReference: '',
      notes: '',
    },
  });

  async function handleFormSubmit(values: DispatchFormValues) {
    await onSubmit({
      title: values.title.trim(),
      priority: values.priority,
      pickupLocation: values.pickupLocation.trim(),
      ...(values.dropoffLocation.trim() ? { dropoffLocation: values.dropoffLocation.trim() } : {}),
      ...(values.scheduledFor ? { scheduledFor: values.scheduledFor } : {}),
      ...(values.jobReference.trim() ? { jobReference: values.jobReference.trim() } : {}),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dispatch-title">Job *</Label>
        <Input
          id="dispatch-title"
          placeholder="Deliver pallets to Southerton warehouse"
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dispatch-pickup">Pickup location *</Label>
          <Input
            id="dispatch-pickup"
            placeholder="Harare depot, 12 Seke Road"
            {...register('pickupLocation', {
              required: 'Pickup location is required',
              maxLength: { value: 200, message: 'Keep this under 200 characters' },
            })}
          />
          {errors.pickupLocation && (
            <p className="text-xs text-destructive" role="alert">
              {errors.pickupLocation.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dispatch-dropoff">Dropoff location</Label>
          <Input
            id="dispatch-dropoff"
            placeholder="Southerton warehouse"
            {...register('dropoffLocation', {
              maxLength: { value: 200, message: 'Keep this under 200 characters' },
            })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dispatch-priority">Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange((v as DispatchFormValues['priority']) ?? 'medium')}
              >
                <SelectTrigger id="dispatch-priority" className="w-full">
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

        <div className="space-y-1.5">
          <Label htmlFor="dispatch-scheduled">Scheduled for</Label>
          <Input id="dispatch-scheduled" type="datetime-local" {...register('scheduledFor')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispatch-reference">Job reference</Label>
        <Input
          id="dispatch-reference"
          placeholder="Customer PO number or job sheet number"
          {...register('jobReference', {
            maxLength: { value: 200, message: 'Keep this under 200 characters' },
          })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispatch-notes">Notes</Label>
        <Textarea
          id="dispatch-notes"
          rows={4}
          placeholder="Anything the driver or dispatcher needs to know."
          {...register('notes', {
            maxLength: { value: 2000, message: 'Keep the details under 2000 characters' },
          })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create dispatch job'}
        </Button>
      </div>
    </form>
  );
}
