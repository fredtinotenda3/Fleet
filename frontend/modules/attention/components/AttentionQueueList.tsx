// frontend/modules/attention/components/AttentionQueueList.tsx

'use client';

import { CheckCircle2, Filter, Truck } from 'lucide-react';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useFleetPresence } from '@/frontend/modules/onboarding/hooks/useFleetPresence';
import { emptyCopy } from '@/frontend/modules/onboarding/utils/empty-state-copy';
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
  const presence = useFleetPresence();
  const empty = emptyCopy('attention', presence);

  if (items.length === 0) {
    if (totalBeforeFilters === 0) {
      /*
        Two different empty feeds, and they were rendered identically.

        On an ESTABLISHED fleet, silence is good news, and an operations
        console must make it legible as "all clear" rather than as "this
        screen failed to load" -- hence the positive tone and the green
        tick.

        On an organisation with NO VEHICLES, the same card enumerated
        five subsystems as checked and clear. Nothing had been checked;
        there was nothing to check. `useFleetPresence` supplies the one
        fact that separates the two, and falls back to the established
        wording whenever the vehicle count is unknown.
      */
      const isEmptyOrg = presence === 'empty';
      return (
        <EmptyState
          tone={empty.tone === 'positive' ? 'positive' : 'default'}
          icon={isEmptyOrg ? <Truck aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          title={empty.title}
          description={empty.description}
          action={
            empty.action ? { label: empty.action.label, href: empty.action.href } : undefined
          }
          hints={
            isEmptyOrg
              ? [
                  'Attention items are derived from your vehicles, their maintenance, fuel and expenses.',
                  'Nothing here is hidden by a filter — the queue has no fleet to draw on yet.',
                ]
              : [
                  'This queue refreshes as telemetry, fuel logs and expenses arrive.',
                  'Items are ranked by severity, cost at stake and how soon they are due.',
                ]
          }
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
