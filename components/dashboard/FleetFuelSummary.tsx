/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  FuelIcon,
  GaugeIcon,
  Droplet,
  DollarSign,
  ListOrdered,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const CARD_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b"];
const CHART_COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6"];

export default function FleetFuelSummary() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalFuel: 0,
    totalCost: 0,
    averageCostPerUnit: 0,
    logCount: 0,
  });
  const [chartData, setChartData] = useState({
    monthlyFuel: [] as { month: string; fuel: number }[],
    topVehicles: [] as { vehicle: string; fuel: number }[],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all fuel logs
      const res = await fetch(`/api/fuellogs`);
      if (!res.ok) throw new Error("Failed to fetch fuel logs");
      const logs = await res.json();

      // Calculate total stats
      const totalFuel = logs.reduce(
        (sum: number, log: any) => sum + log.fuel_volume,
        0
      );
      const totalCost = logs.reduce(
        (sum: number, log: any) => sum + log.cost,
        0
      );
      const averageCostPerUnit = totalFuel > 0 ? totalCost / totalFuel : 0;
      const logCount = logs.length;

      // Prepare monthly fuel data
      const monthlyMap = new Map<string, number>();
      logs.forEach((log: any) => {
        const date = new Date(log.date);
        const month = date.toLocaleString("default", {
          month: "short",
          year: "numeric",
        });
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + log.fuel_volume);
      });

      // Prepare top vehicles data
      const vehicleMap = new Map<string, number>();
      logs.forEach((log: any) => {
        vehicleMap.set(
          log.license_plate,
          (vehicleMap.get(log.license_plate) || 0) + log.fuel_volume
        );
      });

      setStats({
        totalFuel,
        totalCost,
        averageCostPerUnit,
        logCount,
      });

      setChartData({
        monthlyFuel: Array.from(monthlyMap, ([month, fuel]) => ({
          month,
          fuel,
        })),
        topVehicles: Array.from(vehicleMap, ([vehicle, fuel]) => ({
          vehicle,
          fuel,
        }))
          .sort((a, b) => b.fuel - a.fuel)
          .slice(0, 5),
      });
    } catch (error) {
      toast.error("Failed to load fleet fuel data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const StatCard = ({
    icon,
    title,
    value,
    color,
    loading,
  }: {
    icon: React.ReactNode;
    title: string;
    value: string;
    color: string;
    loading: boolean;
  }) => (
    <article className="bg-background rounded-lg border hover:shadow-md transition-shadow">
      <div className="p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
        <div className="space-y-1 min-w-[120px]">
          <h3 className="text-sm text-muted-foreground">{title}</h3>
          {loading ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            <div className="text-xl font-semibold">{value}</div>
          )}
        </div>
      </div>
    </article>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background p-3 border rounded-md shadow-sm">
          <p className="font-semibold">{label}</p>
          <p className="text-sm">
            {payload[0].name === "fuel"
              ? `${payload[0].value.toFixed(2)} L`
              : `$${payload[0].value.toFixed(2)}`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <FuelIcon className="h-5 w-5 text-blue-600" />
        StanleyVerse Fleet Fuel Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Droplet className="w-5 h-5 text-blue-500" />}
          title="Total Fuel"
          value={`${stats.totalFuel.toLocaleString()} L`}
          color={CARD_COLORS[0]}
          loading={loading}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-green-500" />}
          title="Total Cost"
          value={`$${stats.totalCost.toLocaleString()}`}
          color={CARD_COLORS[1]}
          loading={loading}
        />
        <StatCard
          icon={<GaugeIcon className="w-5 h-5 text-red-500" />}
          title="Avg Cost/Liter"
          value={`$${stats.averageCostPerUnit.toFixed(2)}`}
          color={CARD_COLORS[2]}
          loading={loading}
        />
        <StatCard
          icon={<ListOrdered className="w-5 h-5 text-orange-500" />}
          title="Fuel Logs"
          value={stats.logCount.toLocaleString()}
          color={CARD_COLORS[3]}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Monthly Fuel Consumption
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-full h-40" />
              </div>
            ) : chartData.monthlyFuel.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.monthlyFuel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="fuel" name="Fuel" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No fuel data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top Fuel Consumers
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-32 h-32 rounded-full" />
              </div>
            ) : chartData.topVehicles.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.topVehicles}
                    dataKey="fuel"
                    nameKey="vehicle"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ vehicle, percent }) =>
                      `${vehicle}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {chartData.topVehicles.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} L`, "Fuel"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No vehicle data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
