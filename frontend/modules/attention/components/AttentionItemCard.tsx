// frontend/modules/attention/components/AttentionItemCard.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  FileWarning,
  Fuel as FuelIcon,
  Loader2,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { SeverityBadge, StatusBadge } from '@/frontend/shared/ui/patterns';
import { formatDate, formatRelativeDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { cn } from '@/lib/utils';
import type { NeedsAttentionItem } from '../types';
import type { NeedsAttentionSource, NeedsAttentionUrgency } from '@/modules/ai/types/needs-attention.types';
import type { AISeverity } from '@/modules/ai/types/ai.types';
import type { Tone } from '@/frontend/shared/ui/patterns';

/**
 * Kept in sync with NeedsAttentionSource in
 * modules/ai/types/needs-attention.types.ts — its own comment asks for a case
 * here whenever a source is added. Typed as a full Record so a new source is
 * a compile error rather than a silently missing icon.
 */
const SOURCE_ICON: Record<NeedsAttentionSource, ComponentType<{ className?: string }>> = {
  predictive_maintenance: Wrench,
  fleet_health: Sparkles,
  driver_risk: ShieldAlert,
  fuel_fraud: FuelIcon,
  expense_anomaly: ReceiptText,
  compliance: FileWarning,
  maintenance: CalendarClock,
};

/** What each source is telling you, in the operator's words rather than the model's. */
const SOURCE_LABEL: Record<NeedsAttentionSource, string> = {
  predictive_maintenance: 'Predicted failure',
  fleet_health: 'Fleet health',
  driver_risk: 'Driver risk',
  fuel_fraud: 'Fuel anomaly',
  expense_anomaly: 'Expense anomaly',
  compliance: 'Compliance',
  maintenance: 'Service due',
};

const URGENCY_LABEL: Record<NeedsAttentionUrgency, string> = {
  overdue: 'Overdue',
  immediate: 'Act now',
  soon: 'Due soon',
  planned: 'Planned',
  monitor: 'Monitor',
};

const URGENCY_TONE: Record<NeedsAttentionUrgency, Tone> = {
  overdue: 'critical',
  immediate: 'critical',
  soon: 'attention',
  planned: 'neutral',
  monitor: 'neutral',
};

const SEVERITY_RULE: Record<AISeverity, string> = {
  critical: 'border-l-danger',
  high: 'border-l-warning',
  medium: 'border-l-info',
  low: 'border-l-border',
};

interface AttentionItemCardProps {
  item: NeedsAttentionItem;
  rank?: number;
  canResolve: boolean;
  canDispatch: boolean;
  onResolve: (item: NeedsAttentionItem) => void;
  onDispatch: (item: NeedsAttentionItem) => void;
  isResolving?: boolean;
  isDispatching?: boolean;
}

/**
 * One finding, rendered as the product's core narrative rather than as a row
 * in a list:
 *
 *   WHAT      title + entity + severity
 *   WHY       description, plus the evidence the model actually looked at
 *   SO WHAT   money at stake, and when it stops being optional
 *   NOW WHAT  Dispatch (create the work) / Resolve (record the outcome)
 *
 * The evidence section is the part that makes this an intelligence product
 * rather than an alert list. `AIEvidence` entries are references to stored
 * records — an expense id, a telemetry reading, a rollup day — deliberately
 * not prose, so a disputed finding can be re-checked against the same rows
 * the model used. It has been carried on the API response since the evidence
 * work landed and has never been rendered anywhere.
 *
 * The card is NOT itself a link. It was one, and adding action buttons to an
 * anchor would nest interactive elements — invalid HTML that breaks keyboard
 * and screen-reader navigation. The title is the link instead.
 */
export function AttentionItemCard({
  item,
  rank,
  canResolve,
  canDispatch,
  onResolve,
  onDispatch,
  isResolving = false,
  isDispatching = false,
}: AttentionItemCardProps) {
  const [showEvidence, setShowEvidence] = React.useState(false);

  const SourceIcon = SOURCE_ICON[item.source] ?? AlertOctagon;
  const evidence = item.evidence ?? [];
  const busy = isResolving || isDispatching;

  return (
    <li
      className={cn(
        'rounded-lg border border-l-2 border-border bg-card p-4 shadow-xs transition-colors',
        SEVERITY_RULE[item.severity]
      )}
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <span
            className="mt-0.5 w-5 shrink-0 text-right text-caption font-semibold text-muted-foreground tabular-nums"
            aria-hidden="true"
          >
            {rank}
          </span>
        )}

        <SourceIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          {/* WHAT */}
          <div className="flex flex-wrap items-center gap-2">
            {item.href ? (
              <Link
                href={item.href}
                className="text-body-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {item.title}
              </Link>
            ) : (
              <span className="text-body-sm font-medium text-foreground">{item.title}</span>
            )}
            <SeverityBadge severity={item.severity} />
            <StatusBadge tone={URGENCY_TONE[item.urgency]} dot={false}>
              {URGENCY_LABEL[item.urgency]}
            </StatusBadge>
          </div>

          {/* WHY */}
          <p className="mt-1 text-body-sm text-muted-foreground">{item.description}</p>

          {/* SO WHAT */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="font-medium text-foreground/80">{SOURCE_LABEL[item.source]}</span>
            {item.entityLabel && <span>{item.entityLabel}</span>}
            {item.cost > 0 && (
              <span className="tabular-nums">{formatCurrency(item.cost)} at stake</span>
            )}
            {item.dueDate && (
              <span title={formatDate(item.dueDate)}>{formatRelativeDate(item.dueDate)}</span>
            )}
          </div>

          {/* THE BASIS — references to stored records, never prose. */}
          {evidence.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowEvidence((open) => !open)}
                aria-expanded={showEvidence}
                className="inline-flex items-center gap-1 rounded text-caption font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn('size-3 transition-transform', showEvidence && 'rotate-180')}
                  aria-hidden="true"
                />
                Why this was raised ({evidence.length}{' '}
                {evidence.length === 1 ? 'record' : 'records'})
              </button>

              {showEvidence && (
                <ul className="mt-1.5 space-y-1 rounded-md border border-border bg-muted/40 p-2">
                  {evidence.map((entry, index) => (
                    <li
                      key={`${entry.source}-${entry.reference}-${index}`}
                      className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground"
                    >
                      <span className="font-medium text-foreground/80">{entry.source}</span>
                      <code className="rounded bg-background px-1 py-0.5 font-mono text-[0.6875rem]">
                        {entry.reference}
                      </code>
                      {entry.value !== undefined && (
                        <span className="tabular-nums">
                          {entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {entry.observedAt && <span>{formatRelativeDate(entry.observedAt)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* NOW WHAT. Each button appears only when the user holds the
            permission its endpoint enforces, so neither can render and then
            403. */}
        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          {canDispatch && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onDispatch(item)}
              disabled={busy}
              title="Raise the work this finding calls for"
            >
              {isDispatching ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Zap className="size-3" aria-hidden="true" />
              )}
              Dispatch
            </Button>
          )}
          {canResolve && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onResolve(item)}
              disabled={busy}
              title="Record that this has been dealt with"
            >
              {isResolving ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3" aria-hidden="true" />
              )}
              Resolve
            </Button>
          )}
          {item.href && (
            <Button variant="ghost" size="xs" render={<Link href={item.href} />} nativeButton={false}>
              Open
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
