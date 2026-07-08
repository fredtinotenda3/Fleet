// frontend/modules/organizations/components/dashboard/UsageCard.tsx

'use client';

import { Database, Activity } from 'lucide-react';
import type { OrganizationStatistics } from '../../types';

interface UsageCardProps {
  statistics: OrganizationStatistics | undefined;
  isLoading: boolean;
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = pct >= 85;

  return (
    <div className="w-full h-2 overflow-hidden rounded-full bg-muted">
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-full transition-all rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: isNearLimit ? 'var(--danger)' : 'var(--primary)',
        }}
      />
    </div>
  );
}

export function UsageCard({ statistics, isLoading }: UsageCardProps) {
  if (isLoading || !statistics) {
    return (
      <div className="p-5 surface-card">
        <div className="w-40 h-5 mb-4 skeleton" />
        <div className="w-full h-2 mb-2 skeleton" />
        <div className="w-full h-2 skeleton" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 surface-card">
      <h3 className="text-h3">Resource usage</h3>

      <div>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Storage
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {statistics.storageUsedGb.toFixed(1)} GB / {statistics.storageLimitGb} GB
          </span>
        </div>
        <UsageBar used={statistics.storageUsedGb} limit={statistics.storageLimitGb} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            API calls (this month)
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {statistics.apiCallsThisMonth.toLocaleString()} / {statistics.apiCallLimit.toLocaleString()}
          </span>
        </div>
        <UsageBar used={statistics.apiCallsThisMonth} limit={statistics.apiCallLimit} />
      </div>
    </div>
  );
}