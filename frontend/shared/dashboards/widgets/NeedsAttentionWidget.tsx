// frontend/shared/dashboards/widgets/NeedsAttentionWidget.tsx

'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ArrowUpRight,
  Wrench,
  Sparkles,
  ShieldAlert,
  Fuel as FuelIcon,
  ReceiptText,
  FileWarning,
  CalendarClock,
} from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useNeedsAttentionWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { useFleetPresence } from '@/frontend/modules/onboarding/hooks/useFleetPresence';
import { emptyCopy } from '@/frontend/modules/onboarding/utils/empty-state-copy';
import { formatRelativeDate } from '@/shared/utils/date.utils';
import type { NeedsAttentionItem, NeedsAttentionSource } from '@/modules/ai/types/needs-attention.types';
import type { AISeverity } from '@/modules/ai/types/ai.types';

// Status-colour discipline: severity always pairs colour + icon + text
// together (never colour alone), and each semantic token below is used
// for exactly this one meaning across the app -- see the design-token
// pass tracked alongside this widget.
const SEVERITY_BADGE: Record<AISeverity, 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'outline',
  low: 'outline',
};

const SEVERITY_ICON_CLASS: Record<AISeverity, string> = {
  critical: 'text-danger',
  high: 'text-warning',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

const SOURCE_ICON: Record<NeedsAttentionSource, ComponentType<{ className?: string }>> = {
  predictive_maintenance: Wrench,
  fleet_health: Sparkles,
  driver_risk: ShieldAlert,
  fuel_fraud: FuelIcon,
  expense_anomaly: ReceiptText,
  compliance: FileWarning,
  maintenance: CalendarClock,
};

export function NeedsAttentionWidget() {
  const { data, isLoading, isError, refetch } = useNeedsAttentionWidget(6);

  const presence = useFleetPresence();

  const items: NeedsAttentionItem[] = data?.items ?? [];
  const criticalCount = data?.bySeverity?.critical ?? 0;
  const empty = emptyCopy('attention', presence);

  return (
    <DashboardWidget
      title="Needs attention"
      icon={<AlertOctagon className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      errorMessage="Couldn't load the needs-attention feed right now."
      onRefresh={() => refetch()}
      actions={
        criticalCount > 0 ? (
          <Badge variant="destructive" className="shrink-0">
            {criticalCount} critical
          </Badge>
        ) : undefined
      }
      footer={
        <Link href="/needs-attention" className="flex items-center gap-1 text-body-sm text-primary hover:underline">
          View full queue
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {items.length === 0 ? (
        /*
          "Your fleet is in good shape" was rendered for organisations
          with no fleet. Reassurance about a subsystem that was never
          populated is the worst thing a monitoring widget can say --
          see empty-state-copy.ts.
        */
        <div className="py-6 text-center">
          <p className="font-medium text-body-sm text-foreground">{empty.title}</p>
          <p className="mt-1 text-caption text-muted-foreground">{empty.description}</p>
          {empty.action && (
            <Link
              href={empty.action.href}
              className="inline-block mt-2 text-body-sm text-primary hover:underline"
            >
              {empty.action.label}
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const SourceIcon = SOURCE_ICON[item.source] ?? AlertOctagon;
            return (
              <li key={item.id} className="flex items-start gap-2.5 py-2.5">
                <SourceIcon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_ICON_CLASS[item.severity]}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate text-body-sm text-foreground">{item.title}</p>
                    <Badge variant={SEVERITY_BADGE[item.severity]} className="capitalize shrink-0">
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="truncate text-caption text-muted-foreground">{item.description}</p>
                  {item.dueDate && (
                    <p className="text-caption text-muted-foreground">{formatRelativeDate(item.dueDate)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardWidget>
  );
}