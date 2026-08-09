// frontend/modules/telematics/components/LiveMapLegend.tsx

'use client';

import { cn } from '@/lib/utils';
import type { LiveMapVehicleStatus } from '../types';

interface LiveMapLegendProps {
  counts: Record<LiveMapVehicleStatus, number>;
}

const ITEMS: Array<{ status: LiveMapVehicleStatus; label: string; dotClass: string }> = [
  { status: 'moving', label: 'Moving', dotClass: 'bg-success' },
  { status: 'idle', label: 'Idle', dotClass: 'bg-warning' },
  { status: 'offline', label: 'Offline', dotClass: 'bg-muted-foreground' },
];

export function LiveMapLegend({ counts }: LiveMapLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-body-sm text-muted-foreground">
      {ITEMS.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', item.dotClass)} aria-hidden="true" />
          <span>
            {item.label} ({counts[item.status] ?? 0})
          </span>
        </div>
      ))}
    </div>
  );
}