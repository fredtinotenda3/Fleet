// frontend/modules/reports/pages/AIReports.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/shared/ui/navigation/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatCurrency, formatNumber } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { apiClient } from '@/shared/utils/api-client.utils';

interface AIResult {
  success: boolean;
  data?: any;
  results?: any[];
  total?: number;
  succeeded?: number;
  failed?: number;
}

const AI_ENDPOINTS = {
  predictiveMaintenance: '/api/ai/predictive-maintenance',
  fuelFraud: '/api/ai/fuel-fraud',
  expenseAnomalies: '/api/ai/expense-anomalies',
  fleetHealth: '/api/ai/fleet-health',
  driverRisk: '/api/ai/driver-risk',
};

export default function AIReports() {
  const [activeTab, setActiveTab] = useState('predictive');

  const predictiveQuery = useQuery({
    queryKey: ['ai', 'predictive'],
    queryFn: () => apiClient.get<AIResult>(AI_ENDPOINTS.predictiveMaintenance),
  });

  const fuelFraudQuery = useQuery({
    queryKey: ['ai', 'fuelFraud'],
    queryFn: () => apiClient.get<AIResult>(AI_ENDPOINTS.fuelFraud),
  });

  const expenseAnomalyQuery = useQuery({
    queryKey: ['ai', 'expenseAnomalies'],
    queryFn: () => apiClient.get<AIResult>(AI_ENDPOINTS.expenseAnomalies),
  });

  const fleetHealthQuery = useQuery({
    queryKey: ['ai', 'fleetHealth'],
    queryFn: () => apiClient.get<AIResult>(AI_ENDPOINTS.fleetHealth),
  });

  const driverRiskQuery = useQuery({
    queryKey: ['ai', 'driverRisk'],
    queryFn: () => apiClient.get<AIResult>(AI_ENDPOINTS.driverRisk),
  });

  const renderPredictiveMaintenance = () => {
    const { data, isLoading, isError } = predictiveQuery;
    if (isLoading) return <LoadingState />;
    if (isError || !data?.success) return <EmptyState title="Failed to load predictive maintenance data" />;

    const results = data.results || [];
    const succeeded = results.filter((r: any) => r.success);
    const chartData = succeeded.map((r: any) => ({
      name: r.data?.licensePlate || r.entityId,
      cost: r.data?.estimatedCost || 0,
      urgency: r.data?.urgency || 'planned',
    }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title="Vehicles Analyzed" value={data.total || 0} color="blue" />
          <StatsCard title="Predictions Succeeded" value={data.succeeded || 0} color="green" />
          <StatsCard title="Critical Alerts" value={succeeded.filter((r: any) => r.data?.severity === 'critical').length} color="red" />
        </div>
        <ChartContainer title="Estimated Repair Costs by Vehicle">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="cost" fill="var(--primary)">
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.urgency === 'immediate' ? 'var(--destructive)' : 'var(--primary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  const renderFuelFraud = () => {
    const { data, isLoading, isError } = fuelFraudQuery;
    if (isLoading) return <LoadingState />;
    if (isError || !data?.success) return <EmptyState title="Failed to load fuel fraud data" />;

    const results = data.results || [];
    const alerts = results.filter((r: any) => r.success && r.data);
    const severityCount = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((a: any) => {
      const sev = a.data?.severity;
      if (severityCount.hasOwnProperty(sev)) severityCount[sev]++;
    });

    const pieData = Object.entries(severityCount).map(([name, value]) => ({ name, value }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title="Total Fraud Alerts" value={alerts.length} color="red" />
          <StatsCard title="Open Alerts" value={alerts.filter((a: any) => a.data?.status === 'open').length} color="yellow" />
        </div>
        <ChartContainer title="Fraud Alerts by Severity">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={60}>
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={getChartColor(idx)} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  const renderExpenseAnomalies = () => {
    const { data, isLoading, isError } = expenseAnomalyQuery;
    if (isLoading) return <LoadingState />;
    if (isError || !data?.success) return <EmptyState title="Failed to load expense anomaly data" />;

    const results = data.results || [];
    const anomalies = results.filter((r: any) => r.success && r.data);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title="Total Expenses Scanned" value={data.total || 0} color="blue" />
          <StatsCard title="Anomalies Detected" value={anomalies.length} color="yellow" />
          <StatsCard title="Critical Anomalies" value={anomalies.filter((a: any) => a.data?.severity === 'critical').length} color="red" />
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {anomalies.slice(0, 10).map((a: any, idx: number) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  {a.data?.pattern || 'Anomaly'}
                  <Badge variant={a.data?.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {a.data?.severity}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{a.data?.recommendation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const renderFleetHealth = () => {
    const { data, isLoading, isError } = fleetHealthQuery;
    if (isLoading) return <LoadingState />;
    if (isError || !data?.success) return <EmptyState title="Failed to load fleet health data" />;

    const healthData = data.data;
    const { overallScore, metrics, recommendations } = healthData || {};

    const statusColor = overallScore >= 70 ? 'text-green-600' : overallScore >= 50 ? 'text-yellow-600' : 'text-red-600';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${statusColor}`}>{overallScore}%</div>
            <p className="text-sm text-muted-foreground">Overall Fleet Health</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatsCard title="Avg Vehicle Age" value={`${metrics?.averageVehicleAge?.toFixed(1) || 0} yrs`} color="blue" />
          <StatsCard title="Avg Mileage" value={formatNumber(metrics?.averageMileage || 0)} color="green" />
          <StatsCard title="Maintenance Completion" value={`${((metrics?.maintenanceCompletionRate || 0) * 100).toFixed(0)}%`} color="purple" />
          <StatsCard title="Overdue Tasks" value={metrics?.overdueMaintenanceCount || 0} color="red" />
        </div>
        {recommendations?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Recommendations</h3>
            {recommendations.map((rec: any, idx: number) => (
              <Card key={idx}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <Badge variant={rec.priority === 'critical' ? 'destructive' : 'secondary'}>{rec.priority}</Badge>
                    <div>
                      <p className="text-sm font-medium">{rec.title}</p>
                      <p className="text-xs text-muted-foreground">{rec.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDriverRisk = () => {
    const { data, isLoading, isError } = driverRiskQuery;
    if (isLoading) return <LoadingState />;
    if (isError || !data?.success) return <EmptyState title="Failed to load driver risk data" />;

    const results = data.results || [];
    const drivers = results.filter((r: any) => r.success && r.data);
    const chartData = drivers.map((d: any) => ({
      name: d.data?.driverName || d.entityId,
      score: d.data?.overallScore || 0,
    })).sort((a: any, b: any) => b.score - a.score);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title="Drivers Evaluated" value={drivers.length} color="blue" />
          <StatsCard title="High Risk Drivers" value={drivers.filter((d: any) => d.data?.riskLevel === 'critical' || d.data?.riskLevel === 'high').length} color="red" />
          <StatsCard title="Average Risk Score" value={(drivers.reduce((sum: number, d: any) => sum + d.data?.overallScore, 0) / (drivers.length || 1)).toFixed(0)} color="yellow" />
        </div>
        <ChartContainer title="Driver Risk Scores">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="score" fill="var(--primary)">
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.score > 65 ? 'var(--destructive)' : entry.score > 45 ? 'var(--warning)' : 'var(--primary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI-Powered Insights</h1>
        <p className="text-sm text-muted-foreground">
          Predictive maintenance, fraud detection, anomaly analysis, fleet health, and driver risk scores.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="predictive">Predictive Maintenance</TabsTrigger>
          <TabsTrigger value="fuelFraud">Fuel Fraud</TabsTrigger>
          <TabsTrigger value="expenseAnomalies">Expense Anomalies</TabsTrigger>
          <TabsTrigger value="fleetHealth">Fleet Health</TabsTrigger>
          <TabsTrigger value="driverRisk">Driver Risk</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="predictive">{renderPredictiveMaintenance()}</TabsContent>
          <TabsContent value="fuelFraud">{renderFuelFraud()}</TabsContent>
          <TabsContent value="expenseAnomalies">{renderExpenseAnomalies()}</TabsContent>
          <TabsContent value="fleetHealth">{renderFleetHealth()}</TabsContent>
          <TabsContent value="driverRisk">{renderDriverRisk()}</TabsContent>
        </div>
      </Tabs>
    </div>
  );
}