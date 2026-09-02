// frontend/modules/platform-admin/components/CustomRoleTable.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { CustomRole } from '../types';
import { formatDate } from '../utils/platform-admin.utils';
import {
  customRoleStatusPresentation,
  effectiveCustomRolePermissions,
  permissionKeyLabel,
  roleLabel,
} from '../utils/platform-access.utils';

interface CustomRoleTableProps {
  roles: readonly CustomRole[];
  permissionLabels?: Record<string, string>;
}

/**
 * Tenant-defined roles from GET /api/security/roles.
 *
 * THE EXPANDED VIEW SEPARATES INHERITED FROM DIRECT GRANTS.
 * `CustomRole.permissions` is documented as ADDITIVE on top of
 * `baseRole` (see custom-role.types.ts), so a role showing three
 * explicit permissions may actually grant a hundred. Rendering only the
 * explicit list would understate what the role can do on the one screen
 * whose job is to answer that. Flattening them into one list would hide
 * which grants disappear if the base role is unset.
 */
export function CustomRoleTable({ roles, permissionLabels }: CustomRoleTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function label(key: string): string {
    return permissionLabels?.[key] ?? permissionKeyLabel(key);
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Expand</span>
            </TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Base role</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead className="text-right">Grants</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => {
            const id = String(role._id ?? role.name);
            const isOpen = expanded.has(id);
            const grants = effectiveCustomRolePermissions(role);
            const presentation = customRoleStatusPresentation(role.status);

            return [
              <TableRow key={id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} permissions for ${role.name}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {role.name}
                      {role.isSystem && <Badge variant="secondary">System</Badge>}
                    </span>
                    {role.description && (
                      <span className="text-body-sm text-muted-foreground">{role.description}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {role.baseRole ? roleLabel(role.baseRole) : '—'}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">{role.scopeType}</TableCell>
                <TableCell className="text-right tabular-nums text-body-sm">
                  {grants.all.length}
                </TableCell>
                <TableCell>
                  <Badge variant={presentation.badgeVariant} className="gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                      aria-hidden="true"
                    />
                    {role.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {formatDate(role.updatedAt ?? role.createdAt)}
                </TableCell>
              </TableRow>,

              isOpen ? (
                <TableRow key={`${id}-permissions`}>
                  <TableCell colSpan={7} className="space-y-3 bg-muted/30">
                    <div>
                      <p className="mb-1.5 text-body-sm font-medium text-foreground">
                        Granted directly ({grants.direct.length})
                      </p>
                      {grants.direct.length === 0 ? (
                        <p className="text-body-sm text-muted-foreground">None.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {grants.direct.map((key) => (
                            <li key={key}>
                              <Badge variant="outline" title={key}>
                                {label(key)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {role.baseRole && (
                      <div>
                        <p className="mb-1.5 text-body-sm font-medium text-foreground">
                          Inherited from {roleLabel(role.baseRole)} ({grants.inherited.length})
                        </p>
                        {grants.inherited.length === 0 ? (
                          <p className="text-body-sm text-muted-foreground">None.</p>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {grants.inherited.map((key) => (
                              <li key={key}>
                                <Badge variant="secondary" title={key}>
                                  {label(key)}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
