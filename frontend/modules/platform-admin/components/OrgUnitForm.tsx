// frontend/modules/platform-admin/components/OrgUnitForm.tsx
'use client';

import { useMemo, useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { ALLOWED_PARENT_TYPES } from '@/modules/tenancy/constants/hierarchy.constants';
import type { CreateOrgUnitPayload, OrgUnitSummary, OrgUnitType } from '../types';
import {
  ORG_UNIT_TYPE_LABELS,
  eligibleParents,
  orgUnitTypeLabel,
  toCreateOrgUnitPayload,
  validateCreateOrgUnit,
  type FieldErrors,
} from '../utils/platform-admin.utils';

interface OrgUnitFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateOrgUnitPayload) => Promise<unknown>;
  /** Existing units in the same tenant, used to populate the parent picker. */
  units: readonly OrgUnitSummary[];
  isSubmitting?: boolean;
}

const ORG_UNIT_TYPES = Object.keys(ORG_UNIT_TYPE_LABELS) as OrgUnitType[];
/** Sentinel for "top level". A SelectItem cannot carry an empty value. */
const NO_PARENT = '__none__';

const EMPTY = {
  type: 'branch' as OrgUnitType,
  name: '',
  code: '',
  parentId: NO_PARENT,
};

/**
 * Create-org-unit dialog.
 *
 * The parent picker is filtered by `ALLOWED_PARENT_TYPES`, imported
 * from modules/tenancy/constants/hierarchy.constants.ts rather than
 * restated here -- that map is what `HierarchyValidationService`
 * validates against server-side, and a second copy in the UI is how the
 * two silently diverge. Filtering here only spares the operator a
 * rejected submission; the server still decides.
 */
export function OrgUnitForm({
  open,
  onClose,
  onSubmit,
  units,
  isSubmitting = false,
}: OrgUnitFormProps) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});

  const parents = useMemo(
    () => eligibleParents(units, values.type, ALLOWED_PARENT_TYPES),
    [units, values.type]
  );

  const mustBeTopLevel = ALLOWED_PARENT_TYPES[values.type] === null;

  function close() {
    setValues(EMPTY);
    setErrors({});
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parentId = values.parentId === NO_PARENT ? null : values.parentId;
    const found = validateCreateOrgUnit({ ...values, parentId }, ALLOWED_PARENT_TYPES);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    await onSubmit(
      toCreateOrgUnitPayload({
        type: values.type,
        name: values.name,
        code: values.code,
        parentId,
      })
    );
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add branch or unit</DialogTitle>
            <DialogDescription>
              Branches sit at the top level. Every other unit type nests inside a shallower one.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-unit-type">Type</Label>
              <Select
                value={values.type}
                onValueChange={(next) =>
                  // Resetting the parent on a type change is required,
                  // not cosmetic: a parent legal for a `team` is
                  // usually illegal for a `department`, and keeping the
                  // stale id would submit a combination the server
                  // rejects.
                  //
                  // `next` is nullable in Base UI's Select (a cleared
                  // selection), so it is coalesced rather than cast --
                  // a null slipping through as the `type` would fail
                  // validation with a confusing message.
                  setValues((v) => ({
                    ...v,
                    type: (next as OrgUnitType | null) ?? v.type,
                    parentId: NO_PARENT,
                  }))
                }
              >
                <SelectTrigger id="platform-admin-unit-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {ORG_UNIT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {orgUnitTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-body-sm text-destructive">{errors.type}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-unit-name">Name</Label>
              <Input
                id="platform-admin-unit-name"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Harare Branch"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-body-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-unit-code">Code (optional)</Label>
              <Input
                id="platform-admin-unit-code"
                value={values.code}
                onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
                placeholder="HRE"
                aria-invalid={Boolean(errors.code)}
              />
              {errors.code && <p className="text-body-sm text-destructive">{errors.code}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-unit-parent">Parent</Label>
              {mustBeTopLevel ? (
                <p className="text-body-sm text-muted-foreground">
                  A {orgUnitTypeLabel(values.type).toLowerCase()} is created directly under the
                  organization and has no parent.
                </p>
              ) : (
                <>
                  <Select
                    value={values.parentId}
                    onValueChange={(next) =>
                      // A cleared selection (null) means "no parent",
                      // which is the sentinel, not an empty string --
                      // see NO_PARENT.
                      setValues((v) => ({ ...v, parentId: (next as string | null) ?? NO_PARENT }))
                    }
                    disabled={parents.length === 0}
                  >
                    <SelectTrigger id="platform-admin-unit-parent">
                      <SelectValue placeholder="Select a parent unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {parents.map((parent) => (
                        <SelectItem key={parent._id} value={parent._id}>
                          {parent.name} · {orgUnitTypeLabel(parent.type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {parents.length === 0 && (
                    <p className="text-body-sm text-muted-foreground">
                      No eligible parent exists yet. Create a{' '}
                      {(ALLOWED_PARENT_TYPES[values.type] ?? [])
                        .map((t) => orgUnitTypeLabel(t).toLowerCase())
                        .join(' or ')}{' '}
                      first.
                    </p>
                  )}
                </>
              )}
              {errors.parentId && <p className="text-body-sm text-destructive">{errors.parentId}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="mr-2 size-4" />}
              Create unit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
