import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

interface MaintenanceChartsProps {
  statusData: Array<{ status: string; count: number }>;
  trendsData: Array<{
    date: string;
    completed: number;
    pending: number;
    overdue: number;
  }>;
}

export const MaintenanceCharts = ({
  statusData,
  trendsData,
}: MaintenanceChartsProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-4">Services by Status</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={statusData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="status" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>

    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-4">Service Trends</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trendsData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#10b981"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="pending"
            stroke="#f59e0b"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="overdue"
            stroke="#dc2626"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);
