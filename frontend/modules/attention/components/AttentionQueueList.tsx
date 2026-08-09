// frontend/modules/attention/components/AttentionQueueList.tsx

'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  Wrench,
  Sparkles,
  ShieldAlert,
  Fuel as FuelIcon,
  ReceiptText,
  FileWarning,
  CalendarClock,
} from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate, formatRelativeDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { cn } from '@/lib/utils';
import type { NeedsAttentionItem } from '../types';
import type { NeedsAttentionSource, NeedsAttentionUrgency } from '@/modules/ai/types/needs-attention.types';
import type { AISeverity } from '@/modules/ai/types/ai.types';

// Mirrors frontend/shared/dashboards/widgets/NeedsAttentionWidget.tsx's
// SOURCE_ICON so an item looks the same whether it's seen on the
// Dashboard widget or the full Command Centre queue.
const SOURCE_ICON: Record<NeedsAttentionSource, ComponentType<{ className?: string }>> = {
  predictive_maintenance: Wrench,
  fleet_health: Sparkles,
  driver_risk: ShieldAlert,
  fuel_fraud: FuelIcon,
  expense_anomaly: ReceiptText,
  compliance: FileWarning,
  maintenance: CalendarClock,
};

const SEVERITY_ROW_CLASS: Record<AISeverity, string> = {
  critical: 'border-danger-border bg-danger-bg',
  high: 'border-warning-border bg-warning-bg',
  medium: 'border-border bg-card',
  low: 'border-border bg-card',
};

const SEVERITY_ICON_CLASS: Record<AISeverity, string> = {
  critical: 'text-danger',
  high: 'text-warning',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

const SEVERITY_BADGE: Record<AISeverity, 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'outline',
  low: 'outline',
};

const URGENCY_LABEL: Record<NeedsAttentionUrgency, string> = {
  overdue: 'Overdue',
  immediate: 'Immediate',
  soon: 'Due soon',
  planned: 'Planned',
  monitor: 'Monitor',
};

const URGENCY_CLASS: Record<NeedsAttentionUrgency, string> = {
  overdue: 'text-danger',
  immediate: 'text-danger',
  soon: 'text-warning',
  planned: 'text-muted-foreground',
  monitor: 'text-muted-foreground',
};

interface AttentionQueueListProps {
  items: NeedsAttentionItem[];
}

export function AttentionQueueList({ items }: AttentionQueueListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<AlertOctagon className="w-10 h-10 text-muted-foreground" />}
        title="Nothing matches these filters"
        description="Try clearing a filter, or your fleet may simply be in good shape right now."
      />
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => {
        const SourceIcon = SOURCE_ICON[item.source] ?? AlertOctagon;
        const rowClasses = cn(
          'flex items-start gap-3 rounded-md border p-4 transition-colors',
          SEVERITY_ROW_CLASS[item.severity]
        );

        const content = (
          <>
            <span
              className="mt-0.5 shrink-0 text-caption font-semibold text-muted-foreground tabular-nums w-6 text-right"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <SourceIcon className={cn('mt-0.5 h-5 w-5 shrink-0', SEVERITY_ICON_CLASS[item.severity])} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-body-sm text-foreground">{item.title}</p>
                <Badge variant={SEVERITY_BADGE[item.severity]} className="capitalize shrink-0">
                  {item.severity}
                </Badge>
                <span className={cn('text-caption font-medium shrink-0', URGENCY_CLASS[item.urgency])}>
                  {URGENCY_LABEL[item.urgency]}
                </span>
              </div>
              <p className="mt-0.5 text-body-sm text-muted-foreground">{item.description}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-caption text-muted-foreground">
                {item.entityLabel && <span>{item.entityLabel}</span>}
                {item.cost > 0 && <span>{formatCurrency(item.cost)} at stake</span>}
                {item.dueDate && <span title={formatDate(item.dueDate)}>{formatRelativeDate(item.dueDate)}</span>}
              </div>
            </div>
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className={cn(rowClasses, 'hover:brightness-95 dark:hover:brightness-110')}>
                {content}
              </Link>
            ) : (
              <div className={rowClasses}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
