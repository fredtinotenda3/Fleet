// frontend/modules/fuel/components/FuelTopConsumersChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useTopFuelConsumers } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelTopConsumersChart() {
  const { data: topConsumers, isLoading, error } = useTopFuelConsumers(5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Fuel Consumers</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState type="card" count={1} />
        </CardContent>
      </Card>
    );
  }

  if (error || !topConsumers || topConsumers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Fuel Consumers</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxFuel = topConsumers[0]?.totalFuel || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Fuel Consumers</CardTitle>
        <CardDescription>Highest fuel consumption this period</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {topConsumers.map((consumer, index) => (
          <div key={consumer.license_plate} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  #{index + 1} {consumer.license_plate}
                </span>
              </div>
              <div className="text-right">
                <span className="font-medium">{consumer.totalFuel.toFixed(1)} L</span>
                <span className="ml-2 text-muted-foreground">
                  {formatCurrency(consumer.totalCost)}
                </span>
              </div>
            </div>
            <div className="w-full h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all rounded-full bg-primary"
                style={{
                  width: `${(consumer.totalFuel / maxFuel) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}