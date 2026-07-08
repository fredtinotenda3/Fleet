// frontend/modules/organizations/components/roles/RoleList.tsx
'use client';

import { useState } from 'react';
import { Shield, Pencil, Trash2, Plus } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { CreateEditRoleDialog } from './CreateEditRoleDialog';
import { useCustomRoles, useDeleteCustomRole } from '../../hooks/useRoles';
import { STATIC_ROLES, ROLE_LABELS } from '../../types';
import type { CustomRole } from '../../types';

const SCOPE_LABELS: Record<CustomRole['scopeType'], string> = {
  organization: 'Organization-wide',
  branch: 'Branch',
  department: 'Department',
  fleet: 'Fleet',
};

function BuiltInRolesCard() {
  return (
    <div className="p-5 surface-card">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-h3">Built-in roles</h3>
      </div>
      <p className="mb-3 text-body-sm text-muted-foreground">
        Static roles available to every organization. These can&apos;t be edited or deleted, but you
        can create custom roles below for finer-grained access.
      </p>
      <div className="flex flex-wrap gap-2">
        {STATIC_ROLES.map((role) => (
          <Badge key={role} variant="outline">
            {ROLE_LABELS[role]}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function RoleList() {
  const { data: roles = [], isLoading } = useCustomRoles();
  const deleteRole = useDeleteCustomRole();
  const [dialogState, setDialogState] = useState<{ mode: 'create' | 'edit' | null; role: CustomRole | null }>({
    mode: null,
    role: null,
  });
  const [confirmDelete, setConfirmDelete] = useState<CustomRole | null>(null);

  return (
    <div className="space-y-4">
      <BuiltInRolesCard />

      <div className="flex items-center justify-between">
        <h3 className="text-h3">Custom roles</h3>
        <Button size="sm" onClick={() => setDialogState({ mode: 'create', role: null })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New custom role
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 surface-card skeleton" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="p-8 surface-card">
          <EmptyState
            title="No custom roles yet"
            description="Create a custom role to grant fine-grained permissions beyond the built-in roles."
          />
        </div>
      ) : (
        <div className="divide-y surface-card divide-border">
          {roles.map((role) => (
            <div key={role._id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{role.name}</span>
                  <Badge variant="outline">{SCOPE_LABELS[role.scopeType]}</Badge>
                  {role.status === 'inactive' && <Badge variant="destructive">Inactive</Badge>}
                </div>
                {role.description && (
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">{role.description}</p>
                )}
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {role.permissions.length + role.customPermissionKeys.length} permission
                  {role.permissions.length + role.customPermissionKeys.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialogState({ mode: 'edit', role })}
                aria-label={`Edit ${role.name}`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(role)}
                aria-label={`Delete ${role.name}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateEditRoleDialog
        mode={dialogState.mode}
        role={dialogState.role}
        onClose={() => setDialogState({ mode: null, role: null })}
      />

      {confirmDelete && (
        <div role="alertdialog" aria-label="Confirm role deletion" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm p-5 surface-card">
            <h3 className="text-h3">Delete &quot;{confirmDelete.name}&quot;?</h3>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              Any users assigned this role will lose the permissions it grants. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteRole.mutate(confirmDelete._id);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}