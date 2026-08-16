// frontend/modules/fuel/components/FuelTopConsumersChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useTopFuelConsumers } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { TopFuelConsumerRow } from '../types';

interface FuelTopConsumersChartProps {
  /**
   * Vehicle-Level Analytics: scoping this chart to a single vehicle is
   * supported by the underlying query for API consistency, but a
   * "top consumers" ranking is not meaningful for a scope of one -- use
   * FuelKpiCards / FuelActivityTrendChart on a vehicle dashboard instead.
   */
  licensePlate?: string;
}

export function FuelTopConsumersChart({ licensePlate }: FuelTopConsumersChartProps = {}) {
  const { data: topConsumers, isLoading, error } = useTopFuelConsumers(5, licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: TopFuelConsumerRow) {
    openDrawer({ label: row.license_plate, license_plate: row.license_plate });
  }

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
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Top Fuel Consumers</CardTitle>
            <CardDescription>Highest fuel consumption this period &mdash; click a vehicle for details</CardDescription>
          </div>
          <ChartExportButton
            filename={slugifyChartFilename('fuel-top-consumers')}
            sheetName="Top Consumers"
            headers={['License Plate', 'Total Fuel (L)', 'Total Cost']}
            rows={topConsumers.map((r) => ({
              'License Plate': r.license_plate,
              'Total Fuel (L)': r.totalFuel,
              'Total Cost': r.totalCost,
            }))}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {topConsumers.map((consumer, index) => (
            <button
              type="button"
              key={consumer.license_plate}
              onClick={() => handleClick(consumer)}
              className="w-full space-y-1 text-left transition-opacity cursor-pointer hover:opacity-80"
              title="Click to view fuel logs"
            >
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
            </button>
          ))}
        </CardContent>
      </Card>
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
