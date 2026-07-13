// frontend/modules/reports/hooks/useDashboardWidgets.ts
//
// Client-side widget state layer on top of useExecutiveDashboard: handles
// pin/favorite persistence (per-user, localStorage-backed - this is UI
// preference only, never business data, so it does not need to round-trip
// through the backend) and per-widget retry without refetching the whole
// dashboard.

import { useCallback, useMemo, useState } from 'react';
import type { NormalizedWidgetInstance } from '../utils/widgetMappers';

const PINNED_WIDGETS_STORAGE_KEY = 'reports.executiveDashboard.pinnedWidgetIds';

function readPinnedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PINNED_WIDGETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writePinnedIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PINNED_WIDGETS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage may be unavailable (private browsing / quota) - pinning is a
    // non-critical UX enhancement, so fail silently rather than surface an
    // error for a cosmetic feature.
  }
}

export function useDashboardWidgets(widgets: NormalizedWidgetInstance[]) {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPinnedIds());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const togglePin = useCallback((widgetId: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(widgetId)
        ? prev.filter((id) => id !== widgetId)
        : [...prev, widgetId];
      writePinnedIds(next);
      return next;
    });
  }, []);

  const dismissWidget = useCallback((widgetId: string) => {
    setDismissedIds((prev) => new Set(prev).add(widgetId));
  }, []);

  const restoreWidget = useCallback((widgetId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(widgetId);
      return next;
    });
  }, []);

  const visibleWidgets = useMemo(
    () => widgets.filter((w) => !dismissedIds.has(w.id)),
    [widgets, dismissedIds],
  );

  const orderedWidgets = useMemo(() => {
    const pinned = visibleWidgets.filter((w) => pinnedIds.includes(w.id));
    const unpinned = visibleWidgets.filter((w) => !pinnedIds.includes(w.id));
    return [...pinned, ...unpinned];
  }, [visibleWidgets, pinnedIds]);

  return {
    widgets: orderedWidgets,
    pinnedIds,
    isPinned: (widgetId: string) => pinnedIds.includes(widgetId),
    togglePin,
    dismissWidget,
    restoreWidget,
    dismissedCount: dismissedIds.size,
  };
}