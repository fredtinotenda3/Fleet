// frontend/shared/dashboards/widgets/MapsWidget.tsx
//
// Dashboard preview card for the live fleet map. The full interactive
// map (SVG-rendered, no mapping library dependency -- see
// frontend/modules/telematics/components/LiveMapSvg.tsx) now lives at
// /telematics/map; this widget stays a lightweight summary consuming
// the same GET /api/telematics/live-map payload, and links out to the
// full page rather than duplicating the map rendering in a small card.

'use client';

import Link from 'next/link';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useLiveMap } from '@/frontend/modules/telematics/hooks';
import { TELEMATICS_ROUTES } from '@/frontend/modules/telematics/routes';

export function MapsWidget() {
  const { data, isLoading, isError, refetch } = useLiveMap();

  const vehicles = data?.vehicles ?? [];
  const total = vehicles.length;
  const moving = vehicles.filter((v) => v.status === 'moving').length;
  const idle = vehicles.filter((v) => v.status === 'idle').length;
  const offline = vehicles.filter((v) => v.status === 'offline').length;

  return (
    <DashboardWidget
      title="Live fleet map"
      icon={<MapPin className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
      footer={
        <Link
          href={TELEMATICS_ROUTES.liveMap}
          className="flex items-center gap-1 text-body-sm text-primary hover:underline"
        >
          Open live map
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <div className="relative flex items-center justify-center h-40 overflow-hidden border rounded-lg border-border bg-muted/50">
        <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full opacity-40" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, row) =>
            Array.from({ length: 16 }).map((_, col) => (
              <circle key={`${row}-${col}`} cx={col * 13 + 6} cy={row * 13 + 6} r={1} fill="var(--border)" />
            ))
          )}
        </svg>
        <div className="relative z-10 space-y-1 text-center">
          <p className="text-h2 text-foreground">{total}</p>
          <p className="text-body-sm text-muted-foreground">vehicles in fleet</p>
          {total > 0 ? (
            <p className="text-caption text-muted-foreground">
              {moving} moving · {idle} idle · {offline} offline
              {data?.demoMode ? ' · demo data' : ''}
            </p>
          ) : (
            <p className="mt-1 text-caption text-muted-foreground">
              Live GPS tracking available once telematics is connected
            </p>
          )}
        </div>
      </div>
    </DashboardWidget>
  );
}