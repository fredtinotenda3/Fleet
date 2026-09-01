// frontend/modules/observability/components/ProviderHealthTable.tsx
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
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import type { ProviderHealth } from '../types';
import {
  statusPresentation,
  statusLabel,
  formatDuration,
  formatTimestamp,
  formatErrorCategory,
} from '../utils/provider-health.utils';

interface ProviderHealthTableProps {
  providers: ProviderHealth[];
}

export function ProviderHealthTable({ providers }: ProviderHealthTableProps) {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="No telematics providers configured"
        description="Once a provider is enabled for at least one tenant, it will appear here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last sync</TableHead>
          <TableHead>Last error category</TableHead>
          <TableHead>Unavailable for</TableHead>
          <TableHead className="text-right">Tenants (failing / configured)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((provider) => {
          const presentation = statusPresentation(provider.status);
          const errorCategory = formatErrorCategory(provider.lastErrorCategory);
          const unavailableFor = formatDuration(provider.unavailableForMs);

          return (
            <TableRow key={provider.providerId}>
              <TableCell>
                <div className="font-medium">{provider.name}</div>
                <div className="text-xs text-muted-foreground">{provider.providerId}</div>
              </TableCell>
              <TableCell>
                <Badge variant={presentation.badgeVariant} className={`gap-1 ${presentation.badgeClassName}`}>
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                    aria-hidden="true"
                  />
                  {statusLabel(provider.status)}
                </Badge>
              </TableCell>
              <TableCell>{formatTimestamp(provider.lastSyncAt)}</TableCell>
              <TableCell>
                {errorCategory ? (
                  errorCategory
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
              </TableCell>
              <TableCell>
                {unavailableFor ? (
                  unavailableFor
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {provider.failingTenantCount} / {provider.configuredTenantCount}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
