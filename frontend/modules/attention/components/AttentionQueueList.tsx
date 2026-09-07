// frontend/modules/attention/components/AttentionQueueList.tsx

'use client';

import { CheckCircle2, Filter } from 'lucide-react';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { AttentionItemCard } from './AttentionItemCard';
import type { NeedsAttentionItem } from '../types';

interface AttentionQueueListProps {
  items: NeedsAttentionItem[];
  /**
   * How many items the feed returned BEFORE the client-side severity/source
   * filters were applied.
   *
   * WHY THIS PROP EXISTS: the list previously rendered "Nothing matches these
   * filters" for both an empty feed and an over-filtered one. Those are
   * opposite pieces of news — the first says the fleet is in good shape, the
   * second says the operator has hidden their own work — and showing the
   * filter message to someone with a healthy fleet made the product look
   * broken on its single most important screen.
   */
  totalBeforeFilters: number;
  onClearFilters?: () => void;
  canResolve: boolean;
  canDispatch: boolean;
  onResolve: (item: NeedsAttentionItem) => void;
  onDispatch: (item: NeedsAttentionItem) => void;
  resolvingId?: string | null;
  dispatchingId?: string | null;
}

export function AttentionQueueList({
  items,
  totalBeforeFilters,
  onClearFilters,
  canResolve,
  canDispatch,
  onResolve,
  onDispatch,
  resolvingId,
  dispatchingId,
}: AttentionQueueListProps) {
  if (items.length === 0) {
    // Genuinely nothing to do. Rendered as good news, with a positive tone,
    // because in an operations console silence must be legible as "all
    // clear" rather than as "this screen failed to load".
    if (totalBeforeFilters === 0) {
      return (
        <EmptyState
          tone="positive"
          icon={<CheckCircle2 aria-hidden="true" />}
          title="No active attention items"
          description="Nothing across maintenance, fuel, expenses, compliance or driver risk currently needs a decision."
          hints={[
            'This queue refreshes as telemetry, fuel logs and expenses arrive.',
            'Items are ranked by severity, cost at stake and how soon they are due.',
          ]}
        />
      );
    }

    return (
      <EmptyState
        icon={<Filter aria-hidden="true" />}
        title="No items match these filters"
        description={`${totalBeforeFilters.toLocaleString()} ${
          totalBeforeFilters === 1 ? 'item is' : 'items are'
        } in the queue, but none match the severity and source you have selected.`}
        action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
      />
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <AttentionItemCard
          key={item.id}
          item={item}
          rank={index + 1}
          canResolve={canResolve}
          canDispatch={canDispatch}
          onResolve={onResolve}
          onDispatch={onDispatch}
          isResolving={resolvingId === item.id}
          isDispatching={dispatchingId === item.id}
        />
      ))}
    </ol>
  );
}
