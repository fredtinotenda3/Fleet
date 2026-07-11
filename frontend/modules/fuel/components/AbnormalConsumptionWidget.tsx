// frontend/modules/fuel/components/AbnormalConsumptionWidget.tsx

'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useAbnormalFuelConsumption } from '../hooks/useFuel';
import { formatDate } from '@/shared/utils/date.utils';

/**
 * FIX: title changed from "Abnormal consumption detected" to
 * "Abnormal consumption (all-time pattern)" and the description now
 * spells out the comparison window. This card reads
 * FuelRepository.getAbnormalConsumption(), which compares each fuel log
 * against that VEHICLE'S ALL-TIME average volume (no date range) --
 * a different algorithm/window than FuelKpiCards' "Abnormal consumption
 * (this period)" card, which compares against the CURRENT PERIOD average
 * only. The two previously used near-identical wording ("Abnormal
 * consumption" / "Abnormal consumption detected") for different
 * underlying numbers, which read as a bug/inconsistency to anyone
 * viewing both on the Fuel dashboard at once.
 */
export function AbnormalConsumptionWidget() {
  const { data: abnormalLogs, isLoading, error } = useAbnormalFuelConsumption(2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Abnormal consumption (all-time pattern)</CardTitle></CardHeader>
        <CardContent><div className="h-24 rounded-lg skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !abnormalLogs || abnormalLogs.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning-bg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <CardTitle>Abnormal consumption (all-time pattern)</CardTitle>
          </div>
          <Badge variant="outline" className="border-warning text-warning">{abnormalLogs.length} alerts</Badge>
        </div>
        <CardDescription>
          Vehicles with fuel consumption {abnormalLogs[0]?.threshold ?? 2}x above their own all-time average
          &mdash; a separate check from the period-based KPI above
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {abnormalLogs.slice(0, 5).map((log) => (
          <div key={log._id} className="flex items-center justify-between p-2 rounded-lg surface-card">
            <div>
              <p className="font-medium">{log.license_plate}</p>
              <p className="text-sm text-muted-foreground">{log.volume}L @ {log.station_name || 'Unknown station'}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-warning">{log.anomalyScore}x above avg</p>
              <p className="text-sm text-muted-foreground">{formatDate(log.date)}</p>
            </div>
          </div>
        ))}
        {abnormalLogs.length > 5 && (
          <p className="text-sm text-center text-muted-foreground">+{abnormalLogs.length - 5} more alerts</p>
        )}
      </CardContent>
    </Card>
  );
}