// frontend/modules/observability/components/TelemetrySyncStatus.tsx
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
import { statusPresentation, statusLabel, formatTimestamp } from '../utils/provider-health.utils';

interface TelemetrySyncStatusProps {
  providers: ProviderHealth[];
}

/**
 * Compact companion to the full ProviderHealthTable (in the standalone
 * Provider Health dashboard): same underlying data and status
 * presentation, but trimmed to the columns an operator scanning this
 * page for "is telemetry syncing" needs at a glance -- no error
 * category or configured-tenant counts here, since the full breakdown
 * already has a dedicated page linked from Platform > Provider Health.
 */
export function TelemetrySyncStatus({ providers }: TelemetrySyncStatusProps) {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="No telematics providers configured"
        description="Once a provider is enabled for at least one tenant, its sync status will appear here."
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
          <TableHead>Last successful sync</TableHead>
          <TableHead className="text-right">Failing tenants</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((provider) => {
          const presentation = statusPresentation(provider.status);

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
              <TableCell>{formatTimestamp(provider.lastSuccessfulSyncAt)}</TableCell>
              <TableCell className="text-right tabular-nums">{provider.failingTenantCount}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
