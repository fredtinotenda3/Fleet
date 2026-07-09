// frontend/modules/maintenance/components/MaintenanceForm.tsx

'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { maintenanceFormSchema, type MaintenanceFormValues } from '../schemas';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_CATEGORY_LABELS, RECURRENCE_PRESETS } from '../types';
import type { Reminder } from '../types';

interface MaintenanceFormProps {
  record?: Reminder | null;
  onSubmit: (values: MaintenanceFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function MaintenanceForm({ record, onSubmit, onCancel, isSubmitting }: MaintenanceFormProps) {
  const { data: vehiclesResult } = useVehiclesList({ page: 1, limit: 200 });
  const vehicles = vehiclesResult?.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: record
      ? {
          license_plate: record.license_plate,
          title: record.title,
          due_date: new Date(record.due_date).toISOString().slice(0, 10),
          notes: record.notes ?? '',
          status: record.status,
          priority: record.priority ?? 'medium',
          service_type: record.service_type ?? '',
          category: record.category ?? '',
          recurrence_interval: record.recurrence_interval ?? undefined,
          assigned_to: record.assigned_to ?? '',
          estimated_cost: record.estimated_cost ?? undefined,
        }
      : {
          status: 'pending',
          priority: 'medium',
        },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="license_plate">Vehicle *</Label>
          <Controller
            control={control}
            name="license_plate"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
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
          {errors.license_plate && <p className="text-xs text-destructive">{errors.license_plate.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="due_date">Due date *</Label>
          <Input id="due_date" type="date" {...register('due_date')} />
          {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message as string}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" placeholder="e.g. Front brake pad replacement" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{MAINTENANCE_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="service_type">Service type</Label>
          <Input id="service_type" placeholder="e.g. Workshop service" {...register('service_type')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assigned_to">Assigned to</Label>
          <Input id="assigned_to" placeholder="Technician / mechanic" {...register('assigned_to')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="estimated_cost">Estimated cost</Label>
          <Input
            id="estimated_cost"
            type="number"
            step="0.01"
            min="0"
            {...register('estimated_cost', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Recurrence</Label>
        <Controller
          control={control}
          name="recurrence_interval"
          render={({ field }) => (
            <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}>
              <SelectTrigger><SelectValue placeholder="One-time" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">One-time (no recurrence)</SelectItem>
                {RECURRENCE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="Additional details, warranty info, parts used..." {...register('notes')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : record ? 'Save changes' : 'Create record'}
        </Button>
      </div>
    </form>
  );
}