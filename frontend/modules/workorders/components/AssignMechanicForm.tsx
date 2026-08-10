// frontend/modules/workorders/components/AssignMechanicForm.tsx
//
// POST /api/workorders/[id]/assign only accepts { mechanicId, bayId? }
// (workorder.controller.ts's assign()), so this form is deliberately
// small: a required mechanic picker and an optional bay picker. Follows
// the same react-hook-form + Controller + shared <Select> pattern as
// MaintenanceForm.tsx.

'use client';

import { useForm, Controller } from 'react-hook-form';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useAssignableMechanics, useAvailableBays } from '../hooks/useWorkOrders';
import { scopeMechanicsForAssignment } from '../utils/org-unit-scope';
import type { AssignMechanicPayload } from '../types';

interface AssignMechanicFormValues {
  mechanicId: string;
  bayId: string;
}

interface AssignMechanicFormProps {
  onSubmit: (values: AssignMechanicPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function AssignMechanicForm({ onSubmit, onCancel, isSubmitting }: AssignMechanicFormProps) {
  const user = useSessionStore((s) => s.user);
  const { data: members, isLoading: isLoadingMembers } = useAssignableMechanics(user?.tenantId);
  const { data: bays, isLoading: isLoadingBays } = useAvailableBays();

  const mechanics = scopeMechanicsForAssignment(members ?? [], user?.id);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AssignMechanicFormValues>({
    defaultValues: { mechanicId: '', bayId: '' },
  });

  async function handleFormSubmit(values: AssignMechanicFormValues) {
    await onSubmit({ mechanicId: values.mechanicId, bayId: values.bayId || undefined });
  }

  if (isLoadingMembers) return <LoadingState type="card" count={2} />;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mechanicId">Mechanic *</Label>
        <Controller
          control={control}
          name="mechanicId"
          rules={{ required: 'Select a mechanic to assign' }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="mechanicId" className="w-full">
                <SelectValue placeholder="Select a mechanic" />
              </SelectTrigger>
              <SelectContent>
                {mechanics.length === 0 && (
                  <div className="px-2 py-1.5 text-body-sm text-muted-foreground">No mechanics available in your scope</div>
                )}
                {mechanics.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name} ({m.role === 'workshop_manager' ? 'Workshop Manager' : 'Mechanic'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.mechanicId && <p className="text-xs text-destructive">{errors.mechanicId.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bayId">Bay (optional)</Label>
        <Controller
          control={control}
          name="bayId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="bayId" className="w-full">
                <SelectValue placeholder={isLoadingBays ? 'Loading bays...' : 'No bay selected'} />
              </SelectTrigger>
              <SelectContent>
                {(bays ?? []).map((bay) => (
                  <SelectItem key={bay._id} value={bay._id!}>
                    {bay.name} (Bay {bay.bayNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Assigning...' : 'Assign mechanic'}
        </Button>
      </div>
    </form>
  );
}