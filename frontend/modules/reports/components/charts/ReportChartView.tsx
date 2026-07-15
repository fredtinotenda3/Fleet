// frontend/modules/reports/components/charts/ReportChartView.tsx
'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { getChartColor } from '@/shared/utils/chart.utils';

interface ReportResult {
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie';
  xField: string;
  yField: string;
}

interface ReportChartViewProps {
  result: ReportResult;
  chartConfig: ChartConfig;
}

export function ReportChartView({ result, chartConfig }: ReportChartViewProps) {
  const { type, xField, yField } = chartConfig;
  const data = result.rows.map((row) => ({
    name: String(row[xField] ?? ''),
    value: Number(row[yField]) || 0,
  }));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for chart.</p>;
  }

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} />
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              paddingAngle={2}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={getChartColor(index)} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      default:
        return null;
    }
  };

  const chart = renderChart();

  // Prevent rendering the container if the chart type is unsupported (null)
  if (!chart) {
    return <p className="text-sm text-muted-foreground">Unsupported chart type.</p>;
  }

  return (
    <ChartContainer>
      <ResponsiveContainer width="100%" height={300}>
        {chart}
      </ResponsiveContainer>
    </ChartContainer>
  );
}