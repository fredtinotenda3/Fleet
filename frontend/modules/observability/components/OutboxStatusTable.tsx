// frontend/modules/observability/components/OutboxStatusTable.tsx
'use client';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { OutboxCounts, OutboxStatus } from '../types';
import { outboxStatusPresentation, outboxStatusLabel, formatCount } from '../utils/provider-health.utils';

interface OutboxStatusTableProps {
  counts: OutboxCounts;
}

/**
 * Fixed, deliberate order: pending -> processing -> processed is the
 * normal event lifecycle, with dead_letter called out last as the
 * exception state rather than sorted alphabetically or by count (which
 * would move it around the table depending on which number is
 * currently largest -- the one row an operator should be able to find
 * in the same place every time).
 */
const STATUS_ORDER: OutboxStatus[] = ['pending', 'processing', 'processed', 'dead_letter'];

export function OutboxStatusTable({ counts }: OutboxStatusTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {STATUS_ORDER.map((status) => {
          const presentation = outboxStatusPresentation(status);
          const count = counts[status];

          return (
            <TableRow key={status}>
              <TableCell>
                <Badge variant={presentation.badgeVariant} className={`gap-1 ${presentation.badgeClassName}`}>
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                    aria-hidden="true"
                  />
                  {outboxStatusLabel(status)}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">{formatCount(count)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
