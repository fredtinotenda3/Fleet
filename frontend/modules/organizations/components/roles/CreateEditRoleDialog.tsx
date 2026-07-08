// frontend/modules/organizations/components/roles/CreateEditRoleDialog.tsx
'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { PermissionMatrix } from './PermissionMatrix';
import { customRoleSchema, CustomRoleFormValues } from '../../schemas';
import { usePermissionDefinitions, useCreateCustomRole, useUpdateCustomRole } from '../../hooks/useRoles';
import { STATIC_ROLES } from '../../types';
import type { CustomRole } from '../../types';
import { ROLE_LABELS } from '../../types';

interface CreateEditRoleDialogProps {
  role: CustomRole | null;
  mode: 'create' | 'edit' | null;
  onClose: () => void;
}

export function CreateEditRoleDialog({ role, mode, onClose }: CreateEditRoleDialogProps) {
  const { data: definitions = [] } = usePermissionDefinitions();
  const createRole = useCreateCustomRole();
  const updateRole = useUpdateCustomRole(role?._id ?? '');

  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomRoleFormValues>({
    resolver: zodResolver(customRoleSchema),
    defaultValues: {
      name: '',
      description: '',
      baseRole: '',
      scopeType: 'organization',
      permissions: [],
      customPermissionKeys: [],
    },
  });

  useEffect(() => {
    if (mode === 'edit' && role) {
      reset({
        name: role.name,
        description: role.description || '',
        baseRole: role.baseRole || '',
        scopeType: role.scopeType,
        permissions: role.permissions,
        customPermissionKeys: role.customPermissionKeys,
      });
      setSelectedPermissions(new Set([...role.permissions, ...role.customPermissionKeys]));
    } else if (mode === 'create') {
      reset({
        name: '',
        description: '',
        baseRole: '',
        scopeType: 'organization',
        permissions: [],
        customPermissionKeys: [],
      });
      setSelectedPermissions(new Set());
    }
  }, [mode, role, reset]);

  function handlePermissionChange(key: string, checked: boolean) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const onSubmit = handleSubmit(async (values) => {
    const staticDefs = new Set(definitions.filter((d) => !d.isCustom).map((d) => d.key));
    const permissions: string[] = [];
    const customPermissionKeys: string[] = [];
    for (const key of selectedPermissions) {
      if (staticDefs.has(key)) permissions.push(key);
      else customPermissionKeys.push(key);
    }

    const payload = {
      name: values.name,
      description: values.description || undefined,
      baseRole: values.baseRole || undefined,
      scopeType: values.scopeType,
      permissions,
      customPermissionKeys,
    };

    if (mode === 'edit' && role) {
      await updateRole.mutateAsync(payload);
    } else {
      await createRole.mutateAsync(payload);
    }
    onClose();
  });

  const isPending = createRole.isPending || updateRole.isPending;

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      {/* ADDED: max-h-[90dvh] overflow-y-auto to fix off-screen scrolling */}
      <DialogContent className="sm:max-w-form-wide max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit role' : 'Create custom role'}</DialogTitle>
          <DialogDescription>
            Define a role&apos;s permissions. Custom roles can be assigned org-wide or scoped to a
            branch, department, or fleet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name" className="form-label form-required">
                Name
              </Label>
              <Input id="role-name" className="input-base" {...register('name')} />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="role-scope" className="form-label form-required">
                Scope
              </Label>
              <Controller
                control={control}
                name="scopeType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="role-scope" className="input-base">
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organization">Organization-wide</SelectItem>
                      <SelectItem value="branch">Branch</SelectItem>
                      <SelectItem value="department">Department</SelectItem>
                      <SelectItem value="fleet">Fleet</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="role-description" className="form-label">
              Description
            </Label>
            <Textarea id="role-description" className="input-base" rows={2} {...register('description')} />
          </div>

          <div>
            <Label htmlFor="role-base" className="form-label">
              Base role (optional)
            </Label>
            <Controller
              control={control}
              name="baseRole"
              render={({ field }) => (
                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                  <SelectTrigger id="role-base" className="input-base">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {STATIC_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="form-hint">
              Inherits that static role&lsquo;s permissions as a starting point; permissions below are additive.
            </p>
          </div>

          <div>
            <Label className="form-label">Permissions</Label>
            <PermissionMatrix
              definitions={definitions}
              selected={selectedPermissions}
              onChange={handlePermissionChange}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isPending}>
              {(isSubmitting || isPending) && <Spinner className="w-4 h-4 mr-2" />}
              {mode === 'edit' ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}