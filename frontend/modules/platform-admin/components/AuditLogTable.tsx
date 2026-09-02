// frontend/modules/platform-admin/components/AuditLogTable.tsx
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
import type { AuditLogEntry } from '../types';
import {
  auditActionLabel,
  auditSeverityLabel,
  auditSeverityPresentation,
  formatAuditTimestamp,
  shortHash,
} from '../utils/platform-access.utils';

interface AuditLogTableProps {
  entries: readonly AuditLogEntry[];
  /** Shows the tenant column. Only meaningful for a caller whose results actually span tenants. */
  showTenant?: boolean;
}

/**
 * The append-only security ledger.
 *
 * `sequence` AND the chain hashes are surfaced rather than hidden.
 * Every entry commits to the one before it via `prevHash`, so a
 * retroactive edit breaks the chain from that point on -- which is what
 * GET /api/security/audit-log/verify detects. Hiding the sequence would
 * leave an operator no way to tell the verifier "check from here", and
 * hiding the hashes would make the ledger's central claim unverifiable
 * by anything except the endpoint's own say-so.
 *
 * `metadata`/`changes` expand rather than render inline: they are
 * free-form `Record<string, unknown>` and can hold anything a caller
 * logged.
 */
export function AuditLogTable({ entries, showTenant = false }: AuditLogTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
            <TableHead className="text-right">#</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Entity</TableHead>
            {showTenant && <TableHead>Tenant</TableHead>}
            <TableHead>Hash</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            // `sequence` is unique and monotonic across the ledger, so
            // it is a stabler key than `_id` for a paged view.
            const id = String(entry._id ?? entry.sequence);
            const isOpen = expanded.has(id);
            const presentation = auditSeverityPresentation(entry.severity);
            const hasDetail =
              (entry.metadata && Object.keys(entry.metadata).length > 0) ||
              (entry.changes && Object.keys(entry.changes).length > 0) ||
              Boolean(entry.ipAddress || entry.userAgent || entry.eventId);

            return [
              <TableRow key={id}>
                <TableCell>
                  {hasDetail ? (
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} details for entry ${entry.sequence}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums text-body-sm text-muted-foreground">
                  {entry.sequence}
                </TableCell>
                <TableCell className="whitespace-nowrap text-body-sm text-muted-foreground">
                  {formatAuditTimestamp(entry.recordedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {auditActionLabel(entry.action)}
                    </span>
                    {/*
                      The raw action string is kept visible because it is
                      the exact value the `action` filter matches on --
                      an operator who wants "more like this" needs the
                      literal, not the prettified label.
                    */}
                    <code className="text-caption text-muted-foreground">{entry.action}</code>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={presentation.badgeVariant} className="gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                      aria-hidden="true"
                    />
                    {auditSeverityLabel(entry.severity)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <code className="text-body-sm text-muted-foreground">{entry.userId || '—'}</code>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {entry.entityType ? (
                    <span>
                      {entry.entityType}
                      {entry.entityId ? (
                        <code className="ml-1 text-caption">{entry.entityId}</code>
                      ) : null}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                {showTenant && (
                  <TableCell>
                    <code className="text-body-sm text-muted-foreground">{entry.tenantId || '—'}</code>
                  </TableCell>
                )}
                <TableCell>
                  <code className="text-caption text-muted-foreground" title={entry.hash}>
                    {shortHash(entry.hash)}
                  </code>
                </TableCell>
              </TableRow>,

              isOpen ? (
                <TableRow key={`${id}-detail`}>
                  <TableCell colSpan={showTenant ? 9 : 8} className="bg-muted/30">
                    <dl className="grid gap-2 text-body-sm sm:grid-cols-2">
                      {entry.ipAddress && (
                        <div>
                          <dt className="text-muted-foreground">IP address</dt>
                          <dd>
                            <code>{entry.ipAddress}</code>
                          </dd>
                        </div>
                      )}
                      {entry.eventId && (
                        <div>
                          <dt className="text-muted-foreground">Event id</dt>
                          <dd>
                            <code>{entry.eventId}</code>
                          </dd>
                        </div>
                      )}
                      {entry.userAgent && (
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">User agent</dt>
                          <dd className="break-all">{entry.userAgent}</dd>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Previous hash</dt>
                        <dd>
                          <code className="break-all text-caption">{entry.prevHash || '—'}</code>
                        </dd>
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div className="sm:col-span-2">
                          <dt className="mb-1 text-muted-foreground">Metadata</dt>
                          <dd>
                            <pre className="overflow-x-auto rounded-md bg-background p-2 text-caption">
                              {safeJson(entry.metadata)}
                            </pre>
                          </dd>
                        </div>
                      )}
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div className="sm:col-span-2">
                          <dt className="mb-1 text-muted-foreground">Changes</dt>
                          <dd>
                            <pre className="overflow-x-auto rounded-md bg-background p-2 text-caption">
                              {safeJson(entry.changes)}
                            </pre>
                          </dd>
                        </div>
                      )}
                    </dl>
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

/**
 * `metadata` and `changes` are `Record<string, unknown>` written by
 * whatever called `auditLog.log()`. A circular reference or a BigInt in
 * there would throw inside render and take the page down, so the
 * stringify is guarded and degrades to a note rather than crashing a
 * security screen.
 */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '[unserialisable value]';
  }
}
