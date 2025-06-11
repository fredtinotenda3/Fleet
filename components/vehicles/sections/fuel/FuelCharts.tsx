import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const colors = [
  { dark: "#2563eb", light: "#60a5fa" },
  { dark: "#16a34a", light: "#4ade80" },
  { dark: "#dc2626", light: "#f87171" },
  { dark: "#d97706", light: "#fb923c" },
  { dark: "#9333ea", light: "#a855f7" },
];

interface FuelChartsProps {
  consumptionData: Array<{ date: string; volume: number }>;
  costData: Array<{ date: string; cost: number }>;
  efficiencyData: Array<{ date: string; efficiency: number }>;
  theme?: string;
}

export const FuelCharts = ({
  consumptionData = [],
  costData = [],
  efficiencyData = [],
  theme,
}: FuelChartsProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Fuel Consumption Line Chart */}
    <div className="border p-4 rounded-lg">
      <h4 className="text-sm font-medium mb-2">Fuel Consumption Over Time</h4>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={consumptionData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value) => [`${value} units`, "Volume"]} />
            <Line
              type="monotone"
              dataKey="volume"
              stroke={theme === "dark" ? colors[0].dark : colors[0].light}
              strokeWidth={2}
              name="Fuel Consumption"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Fuel Cost Bar Chart */}
    <div className="border p-4 rounded-lg">
      <h4 className="text-sm font-medium mb-2">Fuel Costs Over Time</h4>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={costData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value) => [`$${value}`, "Cost"]} />
            <Bar
              dataKey="cost"
              fill={theme === "dark" ? colors[1].dark : colors[1].light}
              name="Fuel Cost"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Fuel Efficiency Line Chart */}
    <div className="border p-4 rounded-lg md:col-span-2">
      <h4 className="text-sm font-medium mb-2">Fuel Efficiency Over Time</h4>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={efficiencyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip
              formatter={(value) => [`${value} units/mile`, "Efficiency"]}
            />
            <Line
              type="monotone"
              dataKey="efficiency"
              stroke={theme === "dark" ? colors[2].dark : colors[2].light}
              strokeWidth={2}
              name="Fuel Efficiency"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);
