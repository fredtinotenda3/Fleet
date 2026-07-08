// frontend/shared/dashboards/DashboardPersistence.ts
//
// Thin helpers over dashboard.store.ts's persisted zustand state,
// reconciling a user's saved layout against the current WidgetRegistry
// (e.g. after a deploy adds/removes a widget key).

import { WIDGET_ORDER, WIDGET_REGISTRY, type WidgetKey } from './WidgetRegistry';
import type { WidgetLayoutItem } from '@/frontend/shared/store/dashboard.store';

export function reconcileLayout(layout: WidgetLayoutItem[]): WidgetLayoutItem[] {
  const known = layout.filter((item) => item.key in WIDGET_REGISTRY);
  const knownKeys = new Set(known.map((item) => item.key));
  const missing = WIDGET_ORDER.filter((key) => !knownKeys.has(key)).map(
    (key): WidgetLayoutItem => ({ key, visible: true })
  );
  return [...known, ...missing];
}

export function getWidgetTitle(key: WidgetKey): string {
  return WIDGET_REGISTRY[key]?.title ?? key;
}
