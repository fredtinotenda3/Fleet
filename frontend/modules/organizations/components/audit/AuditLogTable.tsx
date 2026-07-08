// frontend/modules/organizations/components/audit/AuditLogTable.tsx
'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useAuditLogPage, useVerifyAuditChain } from '../../hooks/useAdvancedSettings';
import type { AuditLogEntry } from '../../types/advanced.types';

interface AuditLogTableProps {
  organizationId: string;
}

const SEVERITY_VARIANT: Record<NonNullable<AuditLogEntry['severity']>, 'default' | 'outline' | 'destructive'> = {
  info: 'outline',
  warning: 'default',
  critical: 'destructive',
};

const PAGE_SIZE = 20;

export function AuditLogTable({ organizationId }: AuditLogTableProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogPage(organizationId, page, PAGE_SIZE);
  const verifyChain = useVerifyAuditChain();

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          Every privileged action taken on this organization, in a tamper-evident hash chain.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => verifyChain.mutate()}
          disabled={verifyChain.isPending}
        >
          {verifyChain.isPending ? (
            'Verifying…'
          ) : (
            <>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Verify integrity
            </>
          )}
        </Button>
      </div>

      <div className="surface-card">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 skeleton" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8">
            <EmptyState title="No audit events yet" description="Actions taken on this organization will appear here." />
          </div>
        ) : (
          <table className="table-enterprise">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Actor</th>
                <th scope="col">Severity</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id}>
                  <td className="font-medium text-foreground">{entry.action.replace(/_/g, ' ')}</td>
                  <td className="text-caption text-muted-foreground">{entry.userId}</td>
                  <td>
                    {entry.severity && (
                      <Badge variant={SEVERITY_VARIANT[entry.severity]} className="capitalize">
                        {entry.severity === 'critical' && <ShieldAlert className="w-3 h-3 mr-1" aria-hidden="true" />}
                        {entry.severity}
                      </Badge>
                    )}
                  </td>
                  <td className="text-caption text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
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
              <Button
                variant="outline"
                size="sm"
                disabled={page === pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}