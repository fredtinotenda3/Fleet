// frontend/shared/dashboards/widgets/MapsWidget.tsx
//
// Lightweight live-fleet preview panel. No mapping library is currently
// a project dependency, so this renders a stylized status grid rather
// than fabricating GPS data; it links out to a dedicated map page once
// one exists.

'use client';

import Link from 'next/link';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useVehicleStatsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';

export function MapsWidget() {
  const { data, isLoading, isError, refetch } = useVehicleStatsWidget();
  const total = data?.total ?? 0;

  return (
    <DashboardWidget
      title="Live fleet map"
      icon={<MapPin className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
      footer={
        <Link href="/vehicles" className="flex items-center gap-1 text-body-sm text-primary hover:underline">
          View fleet list
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
        <div className="relative z-10 text-center">
          <p className="text-h2 text-foreground">{total}</p>
          <p className="text-body-sm text-muted-foreground">vehicles in fleet</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Live GPS tracking available once telematics is connected
          </p>
        </div>
      </div>
    </DashboardWidget>
  );
}
