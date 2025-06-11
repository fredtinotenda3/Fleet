/* eslint-disable @typescript-eslint/no-explicit-any */
// components/vehicles/sections/expenses/ExpenseCharts.tsx
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface ExpenseChartsProps {
  timeData: { date: string; amount: number }[];
  typeData: { name: string; value: number }[];
  monthlyTrends: { date: string; amount: number }[];
  topCategories: { name: string; value: number }[];
  colors: string[];
  onCategorySelect?: (category: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background p-2 border rounded shadow-lg">
        <p className="font-semibold">{label}</p>
        <p className="text-sm">${payload[0].value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

export function ExpenseCharts({
  timeData,
  typeData,
  monthlyTrends,
  topCategories,
  colors,
  onCategorySelect,
}: ExpenseChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Top Categories Bar Chart */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">Top Categories</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCategories}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill={colors[1]} name="Total Amount">
                {topCategories.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                    onClick={() =>
                      onCategorySelect && onCategorySelect(entry.name)
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Comparison Over Time */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">Daily Expense Comparison</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill={colors[2]} name="Daily Total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Distribution Bar Chart */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">Expenses by Type</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill={colors[0]}>
                {typeData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                    onClick={() =>
                      onCategorySelect && onCategorySelect(entry.name)
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Distribution Pie Chart */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">Category Distribution</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={typeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {typeData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                    onClick={() =>
                      onCategorySelect && onCategorySelect(entry.name)
                    }
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend layout="vertical" align="right" verticalAlign="middle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Trends Over Time */}
      <div className="rounded-lg border p-4 md:col-span-2">
        <h4 className="text-sm font-medium mb-2">Category Trends Over Time</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="amount"
                stroke={colors[0]}
                strokeWidth={2}
                name="Daily Total"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Trends Line Chart */}
      <div className="rounded-lg border p-4 md:col-span-2 xl:col-span-3">
        <h4 className="text-sm font-medium mb-2">Monthly Trends</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="amount"
                stroke={colors[0]}
                strokeWidth={2}
                name="Monthly Total"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
