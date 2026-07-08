/* eslint-disable @typescript-eslint/no-unused-vars */

// frontend/shared/dashboards/DashboardBuilder.tsx

'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Settings2, GripVertical, RotateCcw, X } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { useDashboardStore } from '@/frontend/shared/store/dashboard.store';
import { WIDGET_REGISTRY } from './WidgetRegistry';
import { reconcileLayout } from './DashboardPersistence';
import { cn } from '@/lib/utils';

function SortableRow({ id, title, visible, onToggle }: { id: string; title: string; visible: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 px-3 py-2 border rounded-md border-border bg-card"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${title}`}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="text-body-sm text-foreground">{title}</span>
      </div>
      <Switch checked={visible} onCheckedChange={onToggle} aria-label={`Toggle ${title} visibility`} />
    </div>
  );
}

export function DashboardBuilderToggle() {
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const setCustomizing = useDashboardStore((s) => s.setCustomizing);

  return (
    <Button variant="outline" size="sm" onClick={() => setCustomizing(!isCustomizing)}>
      {isCustomizing ? <X className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
      {isCustomizing ? 'Done' : 'Customize dashboard'}
    </Button>
  );
}

export function DashboardBuilder() {
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const layout = useDashboardStore((s) => s.layout);
  const toggleWidgetVisibility = useDashboardStore((s) => s.toggleWidgetVisibility);
  const reorder = useDashboardStore((s) => s.reorder);
  const resetLayout = useDashboardStore((s) => s.resetLayout);

  const reconciled = React.useMemo(() => reconcileLayout(layout), [layout]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!isCustomizing) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorder(String(active.id) as never, String(over.id) as never);
  }

  return (
    <div className={cn('mb-4 rounded-lg border border-border bg-muted/40 p-4')}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-body-sm text-foreground">Customize your dashboard</p>
        <Button variant="ghost" size="sm" onClick={resetLayout}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={reconciled.map((item) => item.key)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {reconciled.map((item) => (
              <SortableRow
                key={item.key}
                id={item.key}
                title={WIDGET_REGISTRY[item.key]?.title ?? item.key}
                visible={item.visible}
                onToggle={() => toggleWidgetVisibility(item.key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}