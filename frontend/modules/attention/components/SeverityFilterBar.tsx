// frontend/modules/attention/components/SeverityFilterBar.tsx

'use client';

import { cn } from '@/lib/utils';
import type { NeedsAttentionFeed } from '../types';
import type { SeverityFilterValue, SourceFilterValue } from '../types';
import type { NeedsAttentionSource } from '@/modules/ai/types/needs-attention.types';

const SEVERITY_OPTIONS: { value: SeverityFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SOURCE_LABEL: Record<NeedsAttentionSource, string> = {
  predictive_maintenance: 'Predictive maintenance',
  fleet_health: 'Fleet health',
  driver_risk: 'Driver risk',
  fuel_fraud: 'Fuel fraud',
  expense_anomaly: 'Expense anomaly',
  compliance: 'Compliance',
  maintenance: 'Maintenance',
};

const SEVERITY_ACTIVE_CLASS: Record<SeverityFilterValue, string> = {
  all: 'bg-foreground text-background border-foreground',
  critical: 'bg-danger-bg text-danger border-danger-border',
  high: 'bg-warning-bg text-warning border-warning-border',
  medium: 'bg-warning-bg text-warning border-warning-border',
  low: 'bg-muted text-foreground border-border',
};

interface SeverityFilterBarProps {
  severity: SeverityFilterValue;
  onSeverityChange: (value: SeverityFilterValue) => void;
  source: SourceFilterValue;
  onSourceChange: (value: SourceFilterValue) => void;
  feed: NeedsAttentionFeed | undefined;
}

export function SeverityFilterBar({
  severity,
  onSeverityChange,
  source,
  onSourceChange,
  feed,
}: SeverityFilterBarProps) {
  const availableSources = (Object.keys(SOURCE_LABEL) as NeedsAttentionSource[]).filter(
    (key) => (feed?.bySource?.[key] ?? 0) > 0
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by severity">
        {SEVERITY_OPTIONS.map((option) => {
          const count = option.value === 'all' ? feed?.total ?? 0 : feed?.bySeverity?.[option.value] ?? 0;
          const isActive = severity === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSeverityChange(option.value)}
              aria-pressed={isActive}
              className={cn(
                'rounded-full border px-3 py-1 text-caption font-medium transition-colors',
                isActive
                  ? SEVERITY_ACTIVE_CLASS[option.value]
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {option.label}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {availableSources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by source">
          <button
            type="button"
            onClick={() => onSourceChange('all')}
            aria-pressed={source === 'all'}
            className={cn(
              'rounded-full border px-3 py-1 text-caption font-medium transition-colors',
              source === 'all'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            All sources
          </button>
          {availableSources.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSourceChange(key)}
              aria-pressed={source === key}
              className={cn(
                'rounded-full border px-3 py-1 text-caption font-medium transition-colors',
                source === key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {SOURCE_LABEL[key]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
