// frontend/modules/fuel/components/AbnormalConsumptionWidget.tsx

'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useAbnormalFuelConsumption } from '../hooks/useFuel';
import { formatDate } from '@/shared/utils/date.utils';

export function AbnormalConsumptionWidget() {
  const { data: abnormalLogs, isLoading, error } = useAbnormalFuelConsumption(2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Abnormal consumption alerts</CardTitle></CardHeader>
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
            <CardTitle>Abnormal consumption detected</CardTitle>
          </div>
          <Badge variant="outline" className="border-warning text-warning">{abnormalLogs.length} alerts</Badge>
        </div>
        <CardDescription>
          Vehicles with fuel consumption {abnormalLogs[0]?.threshold ?? 2}x above their own average
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