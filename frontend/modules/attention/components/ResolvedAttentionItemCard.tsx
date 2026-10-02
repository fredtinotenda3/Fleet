// frontend/modules/attention/components/ResolvedAttentionItemCard.tsx
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification". The resolved-items counterpart to AttentionItemCard.
//
// Deliberately a SEPARATE, smaller component rather than widening
// AttentionItemCard to accept either item shape: a resolved AttentionItem
// (modules/attention/types/attention-item.types.ts) is a persisted row with
// resolvedAt/resolvedBy/outcomeStatus fields the live-feed NeedsAttentionItem
// never carries, and it has no Dispatch/Resolve actions at all -- only
// Verify outcome. Forcing both shapes through one component's props would
// mean a pile of `item.kind === 'resolved' ? ... : ...` branches threaded
// through every field. Reuses AttentionItemCard's SOURCE_ICON/SOURCE_LABEL/
// SEVERITY_RULE maps rather than redeclaring them, since the sources and
// their meaning are identical -- only what you can DO with the item differs.

'use client';

import Link from 'next/link';
import { AlertOctagon, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { SeverityBadge, StatusBadge } from '@/frontend/shared/ui/patterns';
import { formatDate, formatRelativeDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { cn } from '@/lib/utils';
import { SOURCE_ICON, SOURCE_LABEL, SEVERITY_RULE } from './AttentionItemCard';
import type { AttentionItem, AttentionOutcomeStatus } from '../types';
import type { Tone } from '@/frontend/shared/ui/patterns';

const OUTCOME_TONE: Record<AttentionOutcomeStatus, Tone> = {
  unverified: 'neutral',
  verified_resolved: 'positive',
  reopened: 'critical',
};

const OUTCOME_LABEL: Record<AttentionOutcomeStatus, string> = {
  unverified: 'Not yet verified',
  verified_resolved: 'Outcome verified',
  reopened: 'Reopened',
};

interface ResolvedAttentionItemCardProps {
  item: AttentionItem;
  canVerify: boolean;
  onVerify: (item: AttentionItem) => void;
  isVerifying?: boolean;
}

export function ResolvedAttentionItemCard({
  item,
  canVerify,
  onVerify,
  isVerifying = false,
}: ResolvedAttentionItemCardProps) {
  const SourceIcon = SOURCE_ICON[item.source] ?? AlertOctagon;
  const outcomeStatus: AttentionOutcomeStatus = item.outcomeStatus ?? 'unverified';

  return (
    <li
      className={cn(
        'rounded-lg border border-l-2 border-border bg-card p-4 shadow-xs transition-colors',
        SEVERITY_RULE[item.severity]
      )}
    >
      <div className="flex items-start gap-3">
        <SourceIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

        <div className="min-w-0 flex-1">
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
            <StatusBadge tone={OUTCOME_TONE[outcomeStatus]} dot={false}>
              {OUTCOME_LABEL[outcomeStatus]}
            </StatusBadge>
          </div>

          <p className="mt-1 text-body-sm text-muted-foreground">{item.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="font-medium text-foreground/80">{SOURCE_LABEL[item.source]}</span>
            {item.entityLabel && <span>{item.entityLabel}</span>}
            {item.cost > 0 && <span className="tabular-nums">{formatCurrency(item.cost)}</span>}
            {item.resolvedAt && (
              <span title={formatDate(item.resolvedAt)}>
                Resolved {formatRelativeDate(item.resolvedAt)}
                {item.resolvedBy ? ` by ${item.resolvedBy}` : ''}
              </span>
            )}
          </div>

          {outcomeStatus !== 'unverified' && item.outcomeNote && (
            <p className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-caption text-muted-foreground">
              {item.outcomeNote}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          {canVerify && (
            <Button
              variant={outcomeStatus === 'unverified' ? 'outline' : 'ghost'}
              size="xs"
              onClick={() => onVerify(item)}
              disabled={isVerifying}
              title="Confirm whether the underlying problem is actually gone"
            >
              {isVerifying ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3" aria-hidden="true" />
              )}
              {outcomeStatus === 'unverified' ? 'Verify outcome' : 'Re-verify'}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
