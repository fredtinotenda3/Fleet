// frontend/modules/ai/components/DriverRiskTrend.tsx
//
// Line chart of DriverRiskScore.trends -- a fixed set of 7-day-window
// risk scores over the last 28 days (see generateRiskTrends() in
// driver-risk.service.ts). Higher = riskier, same polarity as
// overallScore. A window with no telematics data is a real 0, not
// missing data, so every point in `trends` is plotted -- this
// component does not filter or skip any of them.

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import type { DriverRiskTrendPoint } from '../types/driver-risk.types';
import { formatRiskTimestamp, formatTrendAxisLabel } from '../utils/driver-risk.utils';

interface DriverRiskTrendProps {
  trends: DriverRiskTrendPoint[] | undefined;
}

export function DriverRiskTrend({ trends }: DriverRiskTrendProps) {
  if (!trends || trends.length === 0) {
    return (
      <EmptyState
        title="No trend data available"
        description="This driver has no telematics history over the last 28 days to chart."
      />
    );
  }

  const chartData = trends.map((point) => ({
    date: point.date,
    label: formatTrendAxisLabel(point.date),
    score: point.score,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} width={32} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
          labelFormatter={(_, payload) =>
            payload && payload[0] ? formatRiskTimestamp(payload[0].payload.date) : ''
          }
          formatter={(value: number) => [String(value), 'Risk score']}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
