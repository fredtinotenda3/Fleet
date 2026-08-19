// frontend/modules/telematics/components/LiveMapLegend.tsx
//
// Alert is shown as a SEPARATE count, not as a fourth status. An
// alerting vehicle is still moving, idle or offline and is still counted
// in one of those three, so moving + idle + offline continues to equal
// the fleet total -- see LiveMapVehicleStatus's doc comment. The alert
// count deliberately overlaps them and is spaced apart to signal that.

'use client';

import { cn } from '@/lib/utils';
import type { LiveMapVehicleStatus } from '../types';

interface LiveMapLegendProps {
  counts: Record<LiveMapVehicleStatus, number>;
  /** Vehicles whose latest reading implies an alert. Overlaps the three status counts by design. */
  alertCount: number;
  /** Vehicles reporting, but on a fix older than the staleness threshold. Also overlapping. */
  staleCount: number;
}

/**
 * Swatch colours reference the same custom properties the map markers
 * use (app/leaflet-overrides.css), so the legend cannot drift from what
 * is actually drawn on the map -- which a Tailwind `bg-success` class
 * here would allow, since the marker palette is not the raw semantic
 * token set.
 */
const ITEMS: Array<{ status: LiveMapVehicleStatus; label: string; colorVar: string }> = [
  { status: 'moving', label: 'Moving', colorVar: 'var(--map-marker-moving, #0e8a5f)' },
  { status: 'idle', label: 'Idle', colorVar: 'var(--map-marker-idle, #a15c00)' },
  { status: 'offline', label: 'Offline', colorVar: 'var(--map-marker-offline, #6b7488)' },
];

function Swatch({ colorVar, ring }: { colorVar: string; ring?: boolean }) {
  return (
    <span
      className={cn('h-2.5 w-2.5 rounded-full', ring && 'ring-1 ring-border ring-offset-1 ring-offset-background')}
      style={{ background: colorVar }}
      aria-hidden="true"
    />
  );
}

export function LiveMapLegend({ counts, alertCount, staleCount }: LiveMapLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-body-sm text-muted-foreground">
      {ITEMS.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <Swatch colorVar={item.colorVar} />
          <span>
            {item.label} ({counts[item.status] ?? 0})
          </span>
        </div>
      ))}

      {alertCount > 0 && (
        <div className="flex items-center gap-1.5 pl-4 border-l border-border">
          <Swatch colorVar="var(--map-marker-alert, #b3261e)" />
          <span>Alert ({alertCount})</span>
        </div>
      )}

      {staleCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Swatch colorVar="transparent" ring />
          <span>Stale fix ({staleCount})</span>
        </div>
      )}
    </div>
  );
}
