// frontend/modules/reports/components/charts/FleetHealthGauge.tsx
'use client';

import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';

interface FleetHealthGaugeProps {
  score: number | undefined;
  isLoading: boolean;
}

export function FleetHealthGauge({ score, isLoading }: FleetHealthGaugeProps) {
  if (isLoading) {
    return (
      <ChartContainer title="Fleet Health Score">
        <Skeleton className="h-40 w-full" />
      </ChartContainer>
    );
  }

  if (score === undefined) {
    return (
      <ChartContainer title="Fleet Health Score">
        <p className="text-sm text-muted-foreground">No health data available.</p>
      </ChartContainer>
    );
  }

  const color = score >= 70 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <ChartContainer title="Fleet Health Score">
      <div className="flex flex-col items-center justify-center py-4">
        <div className={`text-4xl font-bold ${color}`}>{score}%</div>
        <div className="mt-2 h-4 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Overall fleet health</p>
      </div>
    </ChartContainer>
  );
}