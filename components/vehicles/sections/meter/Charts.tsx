import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";

export const TimeSeriesChart = ({
  data,
  color,
  labelColor,
}: {
  data: { date: string; reading: number }[];
  color: string;
  labelColor: string;
}) => {
  // Calculate milestones every 10,000 km
  const readings = data.map((d) => d.reading);
  const maxReading = Math.max(...readings);
  const milestones = [];
  for (let i = 10000; i <= maxReading; i += 10000) {
    milestones.push(i);
  }

  // Find first occurrence of each milestone
  const milestoneAnnotations = milestones
    .map((milestone) => {
      const point = data.find((d) => d.reading >= milestone);
      return point ? { date: point.date, value: milestone } : null;
    })
    .filter(Boolean) as { date: string; value: number }[];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="reading"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color }}
        />
        {milestoneAnnotations.map(({ date, value }) => (
          <ReferenceLine
            key={value}
            x={date}
            stroke={labelColor}
            strokeOpacity={0.5}
            strokeDasharray="3 3"
            label={{
              value: `${value / 1000}k`,
              position: "top",
              fill: labelColor,
              fontSize: 12,
            }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export const UnitDistributionChart = ({
  data,
  colors,
}: {
  data: { name: string; total: number }[];
  colors: string[];
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={data}
        dataKey="total"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={80}
        label={({ name, percent }) =>
          `${name} (${(percent * 100).toFixed(1)}%)`
        }
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Pie>
      <Tooltip
        formatter={(value: number) => [
          `${value.toLocaleString()} units`,
          "Total Usage",
        ]}
      />
      <Legend
        layout="vertical"
        align="right"
        verticalAlign="middle"
        formatter={(value) => <span className="text-sm">{value}</span>}
      />
    </PieChart>
  </ResponsiveContainer>
);

export const UnitUsageOverTimeChart = ({
  data,
  colors,
}: {
  data: { date: string; [key: string]: number | string }[];
  colors: string[];
}) => {
  if (data.length === 0) {
    return <div>No data available</div>;
  }

  // Extract all unit keys dynamically (all keys except "date")
  const unitKeys = Object.keys(data[0]).filter((key) => key !== "date");

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {unitKeys.map((unitName, index) => (
          <Line
            key={unitName}
            type="monotone"
            dataKey={unitName}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
