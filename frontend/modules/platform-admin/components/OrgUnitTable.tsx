// frontend/modules/platform-admin/components/OrgUnitTable.tsx
'use client';

import { CornerDownRight } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { OrgUnitSummary } from '../types';
import {
  buildOrgUnitTree,
  flattenOrgUnitTree,
  orgUnitStatusPresentation,
  orgUnitTypeLabel,
} from '../utils/platform-admin.utils';

interface OrgUnitTableProps {
  units: readonly OrgUnitSummary[];
}

/** Indentation per level. Capped so a deep tree cannot push the name column off-screen. */
const INDENT_REM = 1.25;
const MAX_INDENT_LEVEL = 5;

/**
 * Renders the org-unit hierarchy as indented rows.
 *
 * A table rather than a nested tree widget because this is an admin
 * read surface where type, code and status need to line up in columns
 * for scanning -- the organizations module already has a proper
 * interactive tree (OrgUnitTree) for the editing screen, and
 * duplicating it here would give the product two tree implementations
 * to keep in step.
 *
 * The parent/child shaping is `buildOrgUnitTree` in ../utils, which
 * handles orphans and cycles; see its comment for why both are
 * reachable.
 */
export function OrgUnitTable({ units }: OrgUnitTableProps) {
  const rows = flattenOrgUnitTree(buildOrgUnitTree(units));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((unit) => (
            <TableRow key={unit._id}>
              <TableCell className="font-medium text-foreground">
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    paddingLeft: `${Math.min(unit.level, MAX_INDENT_LEVEL) * INDENT_REM}rem`,
                  }}
                >
                  {unit.level > 0 && (
                    <CornerDownRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {unit.name}
                </span>
              </TableCell>
              <TableCell className="text-body-sm text-muted-foreground">
                {orgUnitTypeLabel(unit.type)}
              </TableCell>
              <TableCell className="text-body-sm text-muted-foreground">
                {unit.code ? <code>{unit.code}</code> : '—'}
              </TableCell>
              <TableCell>
                {(() => {
                  const presentation = orgUnitStatusPresentation(unit.status);
                  return (
                    <Badge variant={presentation.badgeVariant} className="gap-1">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${presentation.dotClassName}`}
                        aria-hidden="true"
                      />
                      {unit.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  );
                })()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
