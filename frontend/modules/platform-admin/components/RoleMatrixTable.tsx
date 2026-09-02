// frontend/modules/platform-admin/components/RoleMatrixTable.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { StaticRoleDefinition } from '../types';
import { permissionKeyLabel } from '../utils/platform-access.utils';

interface RoleMatrixTableProps {
  roles: readonly StaticRoleDefinition[];
  /** Registry labels keyed by permission key, when the catalogue loaded. Falls back to a derived label. */
  permissionLabels?: Record<string, string>;
}

/**
 * The BUILT-IN role matrix: every static Role and the permissions it
 * grants.
 *
 * READ FROM SOURCE, NOT OVER THE WIRE. There is no endpoint for this --
 * GET /api/security/roles returns tenant-defined CUSTOM roles only.
 * `rolePermissions` in server/permissions/roles.ts is a plain
 * TypeScript module the frontend already imports (Sidebar.tsx uses
 * `permissionService` from the same file), so what this renders is
 * exactly the matrix the server enforces. See
 * `buildStaticRoleDefinitions()` in ../utils.
 *
 * Rows expand rather than showing every grant inline: the widest role
 * carries well over a hundred permissions, and a table that renders
 * them all is unreadable and slow.
 */
export function RoleMatrixTable({ roles, permissionLabels }: RoleMatrixTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(role: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
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
            <TableHead>Key</TableHead>
            <TableHead className="text-right">Permissions</TableHead>
            <TableHead>Assignable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((definition) => {
            const isOpen = expanded.has(definition.role);

            return [
              <TableRow key={definition.role}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => toggle(definition.role)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} permissions for ${definition.label}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    {definition.label}
                    {definition.isPlatformRole && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        Platform
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <code className="text-body-sm text-muted-foreground">{definition.role}</code>
                </TableCell>
                <TableCell className="text-right tabular-nums text-body-sm">
                  {definition.permissions.length}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {definition.isAssignable ? (
                    'Yes'
                  ) : definition.isPlatformRole ? (
                    // SUPER_ADMIN is excluded from ORGANIZATION_ROLES
                    // entirely, so it never appears on any assignment
                    // control.
                    <span title="Platform role — never offered on a member assignment">Platform only</span>
                  ) : (
                    // organization_owner is in ORGANIZATION_ROLES but
                    // not ASSIGNABLE_ORGANIZATION_ROLES: it is set once
                    // at creation and moved by an explicit transfer.
                    <span title="Set at organization creation; moved by ownership transfer only">
                      Owner only
                    </span>
                  )}
                </TableCell>
              </TableRow>,

              isOpen ? (
                <TableRow key={`${definition.role}-permissions`}>
                  <TableCell colSpan={5} className="bg-muted/30">
                    {definition.permissions.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground">
                        This role grants no permissions.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {definition.permissions.map((permission) => {
                          const key = String(permission);
                          return (
                            <li key={key}>
                              <Badge variant="outline" title={key}>
                                {permissionLabels?.[key] ?? permissionKeyLabel(key)}
                              </Badge>
                            </li>
                          );
                        })}
                      </ul>
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
