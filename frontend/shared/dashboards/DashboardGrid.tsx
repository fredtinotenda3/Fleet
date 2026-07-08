// frontend/shared/dashboards/DashboardGrid.tsx

'use client';

import * as React from 'react';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useDashboardStore } from '@/frontend/shared/store/dashboard.store';
import { WIDGET_REGISTRY } from './WidgetRegistry';
import { canViewWidget } from './WidgetPermissions';
import { reconcileLayout } from './DashboardPersistence';
import { cn } from '@/lib/utils';

const SIZE_CLASSES: Record<string, string> = {
  sm: 'md:col-span-1',
  md: 'md:col-span-1 xl:col-span-2',
  lg: 'md:col-span-2 xl:col-span-2',
  full: 'md:col-span-2 xl:col-span-4',
};

export function DashboardGrid() {
  const user = useSessionStore((s) => s.user);
  const layout = useDashboardStore((s) => s.layout);
  const roles = user?.roles ?? [];

  const reconciled = React.useMemo(() => reconcileLayout(layout), [layout]);

  const visibleWidgets = reconciled
    .filter((item) => item.visible)
    .map((item) => WIDGET_REGISTRY[item.key])
    .filter((definition) => definition && canViewWidget(definition, roles));

  if (visibleWidgets.length === 0) {
    return (
      <div className="p-10 text-center border border-dashed rounded-lg border-border text-body-sm text-muted-foreground">
        All widgets are hidden. Use &ldquo;Customize dashboard&rdquo; to bring some back.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {visibleWidgets.map((definition) => {
        const WidgetComponent = definition.component;
        return (
          <div key={definition.key} className={cn(SIZE_CLASSES[definition.size])}>
            <WidgetComponent />
          </div>
        );
      })}
    </div>
  );
}
