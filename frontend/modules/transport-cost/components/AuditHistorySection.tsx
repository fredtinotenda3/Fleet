// frontend/modules/transport-cost/components/AuditHistorySection.tsx
//
// GAP-CLOSURE PASS, Objective 1. The operation detail page's audit-
// history section -- reuses AuditLogTable's exact rendering pattern
// (frontend/modules/organizations/components/audit/AuditLogTable.tsx):
// Action/Actor/Severity/When columns, the same table-enterprise class,
// the same EmptyState. Adds one thing that table doesn't need: a
// compact "changed fields" summary derived from `entry.changes.before`/
// `.after` when present, since a bare "UPDATE" action name alone
// doesn't tell an operator what actually changed about their record --
// see TransportCostRecordCommandService.getAuditHistory's own header
// for exactly which actions this section does and doesn't cover.
//
// Handles loading / empty / error states explicitly, per Objective 1's
// requirement -- a permission-denied response surfaces via the same
// error branch as any other fetch failure (this endpoint requires only
// TRANSPORT_COST_VIEW, the same permission needed to reach this page at
// all, so a 403 here would mean something changed mid-session, not a
// routine case -- still handled, not assumed away).

'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSourceRecordAuditHistory } from '../hooks/useTransportCost';
import type { AuditLogEntry } from '../types';

interface AuditHistorySectionProps {
  sourceRecordId: string;
}

const SEVERITY_VARIANT: Record<AuditLogEntry['severity'], 'default' | 'outline' | 'destructive'> = {
  info: 'outline',
  warning: 'default',
  critical: 'destructive',
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
};

const PAGE_SIZE = 20;

/** Best-effort "what changed" summary from a logUpdate entry's `changes: {before, after}` shape -- see auditLog.logUpdate's own signature. Every other shape (logCreate's plain data object, logAction's free-form metadata) is skipped, not guessed at. */
function summarizeChangedFields(entry: AuditLogEntry): string[] {
  const changes = entry.changes as { before?: unknown; after?: unknown } | undefined;
  if (!changes || typeof changes.before !== 'object' || typeof changes.after !== 'object' || !changes.before || !changes.after) {
    return [];
  }
  const before = changes.before as Record<string, unknown>;
  const after = changes.after as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === 'updatedAt' || key === '_id') continue;
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changed.push(key);
    if (changed.length >= 6) break;
  }
  return changed;
}

export function AuditHistorySection({ sourceRecordId }: AuditHistorySectionProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useSourceRecordAuditHistory(sourceRecordId, page, PAGE_SIZE);

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-muted-foreground">
        Edits, corrections, cancellations, and duplications performed on this operation. Postings and reversals are
        shown separately in the ledger history above; identity-review decisions are recorded on the review queue.
      </p>

      <div className="surface-card">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 skeleton" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              icon={<ShieldAlert className="h-8 w-8" aria-hidden="true" />}
              title="Couldn't load audit history"
              description={error instanceof Error ? error.message : "Something went wrong loading this record's history."}
              action={{ label: 'Retry', onClick: () => refetch() }}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8">
            <EmptyState title="No audit history yet" description="Edits, corrections, and other changes to this operation will appear here." />
          </div>
        ) : (
          <table className="table-enterprise">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Changed fields</th>
                <th scope="col">Actor</th>
                <th scope="col">Severity</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const changedFields = summarizeChangedFields(entry);
                return (
                  <tr key={entry._id}>
                    <td className="font-medium text-foreground">{ACTION_LABEL[entry.action] ?? entry.action.replace(/_/g, ' ')}</td>
                    <td className="text-caption text-muted-foreground">
                      {changedFields.length > 0 ? changedFields.join(', ') : '—'}
                    </td>
                    <td className="text-caption text-muted-foreground">{entry.userId}</td>
                    <td>
                      <Badge variant={SEVERITY_VARIANT[entry.severity]} className="capitalize">
                        {entry.severity}
                      </Badge>
                    </td>
                    <td className="text-caption text-muted-foreground">
                      {new Date(entry.recordedAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-caption text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} events
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
