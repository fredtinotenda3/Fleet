
// frontend/shared/dashboards/widgets/AIRecommendationsWidget.tsx

'use client';

import { Sparkles, ShieldAlert, Fuel as FuelIcon, Wrench, ReceiptText } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useAIDashboardWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 55) return 'text-warning';
  return 'text-danger';
}

export function AIRecommendationsWidget() {
  const { data, isLoading, isError, refetch } = useAIDashboardWidget();

  const criticalMaintenance =
    data?.predictiveMaintenance?.results.filter(
      (r) => r.success && r.data && (r.data.severity === 'critical' || r.data.severity === 'high')
    ).length ?? 0;

  const highRiskDrivers =
    data?.driverRisk?.results.filter(
      (r) => r.success && r.data && (r.data.riskLevel === 'high' || r.data.riskLevel === 'critical')
    ).length ?? 0;

  const fuelFraudAlerts = data?.fuelFraud?.results.filter((r) => r.success && r.data).length ?? 0;
  const expenseAnomalies = data?.expenseAnomalies?.results.filter((r) => r.data).length ?? 0;

  const topRecommendations = data?.fleetHealth?.recommendations.slice(0, 3) ?? [];

  return (
    <DashboardWidget
      title="AI insights"
      icon={<Sparkles className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      errorMessage="AI insights are unavailable right now."
      onRefresh={() => refetch()}
    >
      <div className="space-y-4">
        {data?.fleetHealth && (
          <div className="flex items-center gap-4 p-3 border rounded-lg border-border">
            <div className={`text-h1 font-semibold ${scoreColor(data.fleetHealth.overallScore)}`}>
              {data.fleetHealth.overallScore}
              <span className="font-normal text-body-sm text-muted-foreground">/100</span>
            </div>
            <div>
              <p className="font-medium text-body-sm text-foreground">Fleet health score</p>
              <p className="text-caption text-muted-foreground">
                Based on {data.fleetHealth.vehicleScores.length} vehicles
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-border p-2.5 text-center">
            <Wrench className="w-4 h-4 mx-auto text-warning" aria-hidden="true" />
            <p className="mt-1 text-h3">{criticalMaintenance}</p>
            <p className="text-caption text-muted-foreground">Urgent service</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <ShieldAlert className="w-4 h-4 mx-auto text-danger" aria-hidden="true" />
            <p className="mt-1 text-h3">{highRiskDrivers}</p>
            <p className="text-caption text-muted-foreground">High-risk drivers</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <FuelIcon className="w-4 h-4 mx-auto text-info" aria-hidden="true" />
            <p className="mt-1 text-h3">{fuelFraudAlerts}</p>
            <p className="text-caption text-muted-foreground">Fuel anomalies</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <ReceiptText className="w-4 h-4 mx-auto text-accent" aria-hidden="true" />
            <p className="mt-1 text-h3">{expenseAnomalies}</p>
            <p className="text-caption text-muted-foreground">Expense flags</p>
          </div>
        </div>

        {topRecommendations.length > 0 && (
          <div>
            <p className="mb-2 font-semibold tracking-wide uppercase text-caption text-muted-foreground">
              Top recommendations
            </p>
            <ul className="space-y-2">
              {topRecommendations.map((rec, index) => (
                <li key={index} className="flex items-start justify-between gap-2 rounded-md border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="font-medium truncate text-body-sm text-foreground">{rec.title}</p>
                    <p className="line-clamp-2 text-caption text-muted-foreground">{rec.description}</p>
                  </div>
                  <Badge variant={rec.priority === 'critical' ? 'destructive' : 'outline'} className="capitalize shrink-0">
                    {rec.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!data?.fleetHealth && !isLoading && (
          <p className="text-body-sm text-muted-foreground">
            Not enough data yet to generate AI insights for this organization.
          </p>
        )}
      </div>
    </DashboardWidget>
  );
}