/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/dashboard/meters/summary/page.tsx
"use client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
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
  LineChart,
  Line,
} from "recharts";
import { GaugeIcon, CarIcon, TrendingUpIcon, CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Types for our data
interface VehicleDistanceData {
  license_plate: string;
  totalDistance: number;
  unit: string;
}

interface MonthlyDistanceData {
  month: string;
  totalDistance: number;
}

interface UnitDistributionData {
  name: string;
  value: number;
}

interface FleetSummaryStats {
  totalDistance: number;
  avgDistancePerVehicle: number;
  maxDistanceVehicle: string;
  minDistanceVehicle: string;
  monthlyTrend: MonthlyDistanceData[];
  unitDistribution: UnitDistributionData[];
  topVehicles: VehicleDistanceData[];
  vehicleCount: number;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function FleetDistanceSummary() {
  const [stats, setStats] = useState<FleetSummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<
    "monthly" | "quarterly" | "yearly"
  >("yearly");
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch all meter logs
        const logsResponse = await fetch("/api/meterlogs?limit=10000");
        if (!logsResponse.ok) throw new Error("Failed to fetch meter logs");
        const logsData = await logsResponse.json();
        setAllLogs(logsData);

        // Fetch all units
        const unitsResponse = await fetch("/api/units?type=distance");
        if (!unitsResponse.ok) throw new Error("Failed to fetch units");
        const unitsData = await unitsResponse.json();
        setUnits(unitsData);

        // Process the logs to calculate fleet summary
        const processedData = processFleetData(logsData, unitsData);
        setStats(processedData);
      } catch (error) {
        toast.error("Failed to load fleet distance summary");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  // Process raw log data into summary statistics
  const processFleetData = (logs: any[], units: any[]): FleetSummaryStats => {
    // Group logs by vehicle
    const logsByVehicle: Record<string, any[]> = {};
    const unitMap: Record<string, string> = {};

    // Create a map for unit names
    const unitNameMap: Record<string, string> = {};
    units.forEach((unit) => {
      unitNameMap[unit.unit_id] = unit.name;
    });

    logs.forEach((log) => {
      if (!logsByVehicle[log.license_plate]) {
        logsByVehicle[log.license_plate] = [];
      }
      logsByVehicle[log.license_plate].push(log);

      // Track the unit for each vehicle
      if (!unitMap[log.license_plate]) {
        unitMap[log.license_plate] = unitNameMap[log.unit_id] || "Unknown";
      }
    });

    // Calculate distance per vehicle
    const vehicleDistances: VehicleDistanceData[] = [];
    Object.keys(logsByVehicle).forEach((licensePlate) => {
      const vehicleLogs = logsByVehicle[licensePlate];
      vehicleLogs.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const firstReading = vehicleLogs[0]?.odometer || 0;
      const lastReading = vehicleLogs[vehicleLogs.length - 1]?.odometer || 0;

      vehicleDistances.push({
        license_plate: licensePlate,
        totalDistance: lastReading - firstReading,
        unit: unitMap[licensePlate],
      });
    });

    // Calculate summary stats
    const totalDistance = vehicleDistances.reduce(
      (sum, vehicle) => sum + vehicle.totalDistance,
      0
    );
    const vehicleCount = vehicleDistances.length;
    const avgDistancePerVehicle =
      vehicleCount > 0 ? totalDistance / vehicleCount : 0;

    // Find vehicles with max/min distance
    const sortedVehicles = [...vehicleDistances].sort(
      (a, b) => b.totalDistance - a.totalDistance
    );
    const maxDistanceVehicle = sortedVehicles[0]
      ? `${
          sortedVehicles[0].license_plate
        } (${sortedVehicles[0].totalDistance.toLocaleString()} ${
          sortedVehicles[0].unit
        })`
      : "N/A";
    const minDistanceVehicle =
      sortedVehicles.length > 0
        ? `${
            sortedVehicles[sortedVehicles.length - 1].license_plate
          } (${sortedVehicles[
            sortedVehicles.length - 1
          ].totalDistance.toLocaleString()} ${
            sortedVehicles[sortedVehicles.length - 1].unit
          })`
        : "N/A";

    // Calculate unit distribution
    const unitCounts: Record<string, number> = {};
    logs.forEach((log) => {
      const unit = unitNameMap[log.unit_id] || "Unknown";
      unitCounts[unit] = (unitCounts[unit] || 0) + 1;
    });

    const unitDistribution = Object.keys(unitCounts).map((unit) => ({
      name: unit,
      value: unitCounts[unit],
    }));

    // Get top 5 vehicles
    const topVehicles = sortedVehicles.slice(0, 5);

    // PROPERLY CALCULATE MONTHLY TREND FROM DATABASE
    const monthlyTrend = calculateMonthlyTrend(
      logs,
      logsByVehicle,
      unitNameMap
    );

    return {
      totalDistance,
      avgDistancePerVehicle,
      maxDistanceVehicle,
      minDistanceVehicle,
      monthlyTrend,
      unitDistribution,
      topVehicles,
      vehicleCount,
    };
  };

  // Calculate monthly distance trend from actual database data
  const calculateMonthlyTrend = (
    logs: any[],
    logsByVehicle: Record<string, any[]>,
    unitNameMap: Record<string, string>
  ): MonthlyDistanceData[] => {
    // Get all unique months from logs
    const monthsSet = new Set<string>();
    logs.forEach((log) => {
      const date = new Date(log.date);
      const month = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      monthsSet.add(month);
    });

    // Sort months chronologically
    const sortedMonths = Array.from(monthsSet).sort();

    // Calculate distance per month
    return sortedMonths.map((month) => {
      let totalDistance = 0;

      Object.keys(logsByVehicle).forEach((licensePlate) => {
        const vehicleLogs = logsByVehicle[licensePlate];
        const monthlyLogs = vehicleLogs.filter((log) => {
          const logDate = new Date(log.date);
          const logMonth = `${logDate.getFullYear()}-${(logDate.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`;
          return logMonth === month;
        });

        if (monthlyLogs.length > 0) {
          // Sort by date and calculate distance for the month
          monthlyLogs.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const first = monthlyLogs[0].odometer;
          const last = monthlyLogs[monthlyLogs.length - 1].odometer;
          totalDistance += last - first;
        }
      });

      // Format month as "MMM YYYY"
      const [year, monthNum] = month.split("-");
      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1)
        .toLocaleString("default", { month: "short" })
        .toUpperCase();

      return {
        month: `${monthName} ${year}`,
        totalDistance,
      };
    });
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border rounded-md shadow-lg">
          <p className="font-bold">{label}</p>
          <p className="text-blue-600">{`${payload[0].value.toLocaleString()} km`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <GaugeIcon className="h-8 w-8 text-blue-600" />
            Fleet Distance Summary
          </h1>
          <p className="text-muted-foreground">
            Comprehensive overview of distance metrics across all vehicles
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange("monthly")}
            className={cn(
              "px-3 py-1 rounded-md text-sm",
              timeRange === "monthly"
                ? "bg-blue-500 text-white"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setTimeRange("quarterly")}
            className={cn(
              "px-3 py-1 rounded-md text-sm",
              timeRange === "quarterly"
                ? "bg-blue-500 text-white"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            Quarterly
          </button>
          <button
            onClick={() => setTimeRange("yearly")}
            className={cn(
              "px-3 py-1 rounded-md text-sm",
              timeRange === "yearly"
                ? "bg-blue-500 text-white"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Vehicles Tracked"
          value={stats?.vehicleCount ? stats.vehicleCount.toString() : "0"}
          icon={<CarIcon className="h-6 w-6" />}
          loading={loading}
          color="bg-blue-100 text-blue-800"
        />
        <StatCard
          title="Total Distance"
          value={
            stats?.totalDistance
              ? `${stats.totalDistance.toLocaleString()} km`
              : "0 km"
          }
          icon={<GaugeIcon className="h-6 w-6" />}
          loading={loading}
          color="bg-green-100 text-green-800"
        />
        <StatCard
          title="Avg per Vehicle"
          value={
            stats?.avgDistancePerVehicle
              ? `${Math.round(stats.avgDistancePerVehicle).toLocaleString()} km`
              : "0 km"
          }
          icon={<TrendingUpIcon className="h-6 w-6" />}
          loading={loading}
          color="bg-amber-100 text-amber-800"
        />
        <StatCard
          title="Highest Vehicle"
          value={stats?.maxDistanceVehicle || "N/A"}
          icon={<CalendarIcon className="h-6 w-6" />}
          loading={loading}
          color="bg-purple-100 text-purple-800"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distance Over Time Chart - NOW USING REAL DATA */}
        <ChartCard title="Distance Trend Over Time" loading={loading}>
          {stats?.monthlyTrend && stats.monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="totalDistance"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#3b82f6" }}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No distance data available
            </div>
          )}
        </ChartCard>

        {/* Unit Distribution Chart */}
        <ChartCard title="Unit Usage Distribution" loading={loading}>
          {stats?.unitDistribution && stats.unitDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.unitDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {stats.unitDistribution.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} logs`, "Count"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No unit distribution data
            </div>
          )}
        </ChartCard>

        {/* Top Vehicles Chart */}
        <ChartCard
          title="Top Vehicles by Distance"
          description="Vehicles with the highest total distance"
          loading={loading}
          className="lg:col-span-2"
        >
          {stats?.topVehicles && stats.topVehicles.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={stats.topVehicles}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  dataKey="license_plate"
                  type="category"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [`${value}`, "Distance"]}
                  labelFormatter={(value) => `Vehicle: ${value}`}
                />
                <Bar
                  dataKey="totalDistance"
                  name="Distance"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                  label={{
                    position: "right",
                    formatter: (value: string) =>
                      `${value} ${
                        stats.topVehicles.find((v) => v.license_plate === value)
                          ?.unit || ""
                      }`,
                  }}
                >
                  {stats.topVehicles.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No vehicle distance data available
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// Stat Card Component
const StatCard = ({
  title,
  value,
  icon,
  loading,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
  color?: string;
}) => (
  <Card className={cn("h-full", color)}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <div className="text-2xl font-bold">{value}</div>
      )}
    </CardContent>
  </Card>
);

// Chart Wrapper Component
const ChartCard = ({
  title,
  children,
  loading,
  className,
  description,
}: {
  title: string;
  children: React.ReactNode;
  loading: boolean;
  className?: string;
  description?: string;
}) => (
  <Card className={cn("h-full flex flex-col", className)}>
    <CardHeader>
      <CardTitle className="text-lg">{title}</CardTitle>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </CardHeader>
    <CardContent className="flex-grow">
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        children
      )}
    </CardContent>
  </Card>
);
