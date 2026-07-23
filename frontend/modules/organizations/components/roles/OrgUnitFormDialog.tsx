// frontend/modules/organizations/components/roles/OrgUnitFormDialog.tsx
'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { orgUnitFormSchema, OrgUnitFormValues } from '../../schemas';
import { useCreateOrgUnit, useUpdateOrgUnit } from '../../hooks/useOrganizationMutations';
import { useOrgUnits } from '../../hooks/useOrganizations';
import { ALLOWED_PARENT_TYPES } from '@/modules/tenancy/constants/hierarchy.constants';
import type { OrgUnitNode } from '../../types';

interface OrgUnitFormDialogProps {
  mode: 'create' | 'edit' | null;
  unit: OrgUnitNode | null;
  /** When creating from a "+" button on a specific tree node, preselects that node as the parent. */
  defaultParentId?: string | null;
  onClose: () => void;
}

const TYPE_LABELS: Record<OrgUnitNode['type'], string> = {
  branch: 'Branch',
  department: 'Department',
  team: 'Team',
  fleet: 'Fleet',
  workshop: 'Workshop',
};

export function OrgUnitFormDialog({ mode, unit, defaultParentId, onClose }: OrgUnitFormDialogProps) {
  const { data: allUnits = [] } = useOrgUnits();
  const createUnit = useCreateOrgUnit();
  const updateUnit = useUpdateOrgUnit(unit?.id ?? '');

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<OrgUnitFormValues>({
    resolver: zodResolver(orgUnitFormSchema),
    defaultValues: {
      type: 'branch',
      name: '',
      code: '',
      parentId: defaultParentId ?? null,
      managerId: '',
    },
  });

  useEffect(() => {
    if (mode === 'edit' && unit) {
      reset({
        type: unit.type,
        name: unit.name,
        code: unit.code || '',
        parentId: unit.parentId ?? null,
        managerId: unit.managerId || '',
      });
    } else if (mode === 'create') {
      reset({ type: 'branch', name: '', code: '', parentId: defaultParentId ?? null, managerId: '' });
    }
  }, [mode, unit, defaultParentId, reset]);

  const selectedType = watch('type');
  const selectedParentId = watch('parentId');

  // `null` means the type must be top-level (no parent at all).
  const allowedParentTypes = ALLOWED_PARENT_TYPES[selectedType];
  const requiresParent = allowedParentTypes !== null;

  // Options shown in "Parent unit": only units whose type is a valid parent
  // for the currently-selected type. In edit mode we also keep the unit's
  // *current* parent in the list even if it no longer matches the rules
  // (older data) — otherwise the dropdown silently falls back to "no parent"
  // and saving would wipe out a real, existing parent.
  const parentOptions = useMemo(() => {
    if (!requiresParent) return [];
    const valid = allUnits.filter((u) => u.id !== unit?.id && allowedParentTypes!.includes(u.type));
    if (mode === 'edit' && unit?.parentId && !valid.some((u) => u.id === unit.parentId)) {
      const currentParent = allUnits.find((u) => u.id === unit.parentId);
      if (currentParent) return [currentParent, ...valid];
    }
    return valid;
  }, [allUnits, allowedParentTypes, requiresParent, unit, mode]);

  // If Type changes to something that no longer allows the currently
  // selected parent (or no longer allows any parent), clear it instead of
  // letting an invalid combination reach submit.
  useEffect(() => {
    if (!selectedParentId) return;
    if (!requiresParent) {
      setValue('parentId', null);
      return;
    }
    const stillValid = parentOptions.some((u) => u.id === selectedParentId);
    if (!stillValid) {
      setValue('parentId', null);
    }
    // Only re-run when the Type actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  const onSubmit = handleSubmit(async (values) => {
    clearErrors('parentId');

    const allowed = ALLOWED_PARENT_TYPES[values.type];
    if (allowed === null && values.parentId) {
      setError('parentId', {
        type: 'manual',
        message: `"${TYPE_LABELS[values.type]}" units must be top-level (no parent).`,
      });
      return;
    }
    if (allowed !== null && !values.parentId) {
      setError('parentId', {
        type: 'manual',
        message: `"${TYPE_LABELS[values.type]}" units must be nested under one of: ${allowed
          .map((t) => TYPE_LABELS[t])
          .join(', ')}.`,
      });
      return;
    }

    const payload = {
      type: values.type,
      name: values.name,
      code: values.code || undefined,
      parentId: values.parentId || null,
      managerId: values.managerId || undefined,
    };

    if (mode === 'edit' && unit) {
      await updateUnit.mutateAsync(payload);
    } else {
      await createUnit.mutateAsync(payload);
    }
    onClose();
  });

  const isPending = createUnit.isPending || updateUnit.isPending;

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-form-narrow">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit org unit' : 'Create org unit'}</DialogTitle>
          <DialogDescription>
            Branches, departments, teams, fleets, and workshops make up your organization&apos;s hierarchy.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="unit-type" className="form-label form-required">
              Type
            </Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={mode === 'edit'}>
                  <SelectTrigger id="unit-type" className="input-base">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as OrgUnitNode['type'][]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {mode === 'edit' && (
              <p className="form-hint">Type can&apos;t be changed after creation.</p>
            )}
          </div>

          <div>
            <Label htmlFor="unit-name" className="form-label form-required">
              Name
            </Label>
            <Input id="unit-name" className="input-base" {...register('name')} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>

          <div>
            <Label htmlFor="unit-code" className="form-label">
              Code
            </Label>
            <Input id="unit-code" className="input-base" {...register('code')} placeholder="e.g. HRE-01" />
          </div>

          <div>
            <Label htmlFor="unit-parent" className={requiresParent ? 'form-label form-required' : 'form-label'}>
              Parent unit
            </Label>
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                >
                  <SelectTrigger id="unit-parent" className="input-base">
                    <SelectValue placeholder={requiresParent ? 'Select a parent unit' : 'Top-level (no parent)'} />
                  </SelectTrigger>
                  <SelectContent>
                    {!requiresParent && <SelectItem value="none">Top-level (no parent)</SelectItem>}
                    {parentOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({TYPE_LABELS[u.type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {requiresParent && (
              <p className="form-hint">
                {TYPE_LABELS[selectedType]} units must be nested under: {allowedParentTypes!.map((t) => TYPE_LABELS[t]).join(', ')}.
              </p>
            )}
            {errors.parentId && <p className="form-error">{errors.parentId.message as string}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isPending}>
              {(isSubmitting || isPending) && <Spinner className="w-4 h-4 mr-2" />}
              {mode === 'edit' ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}