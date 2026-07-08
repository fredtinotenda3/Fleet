// frontend/modules/organizations/components/roles/OrgUnitTree.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { OrgUnitFormDialog } from './OrgUnitFormDialog';
import { useOrgUnits, buildOrgUnitTree } from '../../hooks/useOrganizations';
import { useDeleteOrgUnit } from '../../hooks/useOrganizationMutations';
import type { OrgUnitNode } from '../../types';

const TYPE_BADGE_LABEL: Record<OrgUnitNode['type'], string> = {
  branch: 'Branch',
  department: 'Department',
  team: 'Team',
  fleet: 'Fleet',
  workshop: 'Workshop',
};

function TreeNode({
  node,
  depth,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  node: OrgUnitNode;
  depth: number;
  onCreateChild: (parentId: string) => void;
  onEdit: (node: OrgUnitNode) => void;
  onDelete: (node: OrgUnitNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-center w-5 h-5 shrink-0 text-muted-foreground"
          disabled={!hasChildren}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </button>

        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium truncate text-foreground">{node.name}</span>
        {node.code && <span className="shrink-0 text-caption text-muted-foreground">({node.code})</span>}
        <Badge variant="outline" className="ml-1 shrink-0">
          {TYPE_BADGE_LABEL[node.type]}
        </Badge>
        {node.status === 'inactive' && (
          <Badge variant="destructive" className="shrink-0">Inactive</Badge>
        )}

        <div className="flex gap-1 ml-auto transition-opacity opacity-0 shrink-0 group-hover:opacity-100">
          <Button variant="ghost" size="sm" onClick={() => onCreateChild(node.id)} aria-label={`Add child to ${node.name}`}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(node)} aria-label={`Edit ${node.name}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(node)} aria-label={`Delete ${node.name}`}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgUnitTree() {
  const { data: units = [], isLoading } = useOrgUnits();
  const deleteUnit = useDeleteOrgUnit();

  const [dialogState, setDialogState] = useState<{
    mode: 'create' | 'edit' | null;
    unit: OrgUnitNode | null;
    parentId: string | null;
  }>({ mode: null, unit: null, parentId: null });
  const [confirmDelete, setConfirmDelete] = useState<OrgUnitNode | null>(null);

  const tree = buildOrgUnitTree(units);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">Organization structure</h3>
        <Button size="sm" onClick={() => setDialogState({ mode: 'create', unit: null, parentId: null })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add top-level unit
        </Button>
      </div>

      <div className="p-2 surface-card">
        {isLoading ? (
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 skeleton" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No org units yet"
              description="Create branches, departments, teams, fleets, or workshops to structure your organization."
            />
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              onCreateChild={(parentId) => setDialogState({ mode: 'create', unit: null, parentId })}
              onEdit={(unit) => setDialogState({ mode: 'edit', unit, parentId: null })}
              onDelete={setConfirmDelete}
            />
          ))
        )}
      </div>

      <OrgUnitFormDialog
        mode={dialogState.mode}
        unit={dialogState.unit}
        defaultParentId={dialogState.parentId}
        onClose={() => setDialogState({ mode: null, unit: null, parentId: null })}
      />

      {confirmDelete && (
        <div role="alertdialog" aria-label="Confirm org unit deletion" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm p-5 surface-card">
            <h3 className="text-h3">Delete &quot;{confirmDelete.name}&quot;?</h3>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              {(confirmDelete.children?.length ?? 0) > 0
                ? 'This unit has child units and cannot be deleted until they are moved or removed.'
                : "This can't be undone."}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={(confirmDelete.children?.length ?? 0) > 0}
                onClick={() => {
                  deleteUnit.mutate(confirmDelete.id);
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