// src/app/(dashboard)/dashboard/maintenance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/vehicles/sections/maintenance/AnalyticsComponents";
import { MaintenanceCharts } from "@/components/vehicles/sections/maintenance/MaintenanceCharts";
import { Wrench, CalendarCheck, AlarmClockCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { Reminder, Vehicle, MeterLog, Trip, MaintenanceCategory } from "@/types";
import { format, parse, isAfter } from "date-fns";
import { calculateCombinedDistance, getDistanceSinceDate } from "@/lib/distance";

interface ServiceAlert {
  vehicle: Vehicle;
  lastServiceDate: Date | null;
  lastServiceOdometer: number | null;
  distanceSinceLastService: number;
  alertType: "warning" | "critical" | "due_soon";
  daysOverdue?: number;
}

// Category display names
const categoryNames: Record<MaintenanceCategory, string> = {
  braking_system: "Braking System",
  fuel_system: "Fuel System",
  spring_suspension: "Spring & Suspension",
  auto_electricals: "Auto Electricals",
  engine_gearbox: "Engine & Gearbox",
  cab_body: "Cab / Body",
};

export default function FleetMaintenanceSummary() {
  const [chartData, setChartData] = useState<Reminder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [meterLogsMap, setMeterLogsMap] = useState<Map<string, MeterLog[]>>(new Map());
  const [tripsMap, setTripsMap] = useState<Map<string, Trip[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Calculate crucial maintenance statistics with category breakdown
  const stats = useMemo(() => {
    const filteredData = selectedCategory === "all" 
      ? chartData 
      : chartData.filter(r => (r as any).category === selectedCategory);

    const byCategory = chartData.reduce((acc, reminder) => {
      const cat = (reminder as any).category as MaintenanceCategory;
      if (cat) {
        if (!acc[cat]) {
          acc[cat] = { total: 0, pending: 0, completed: 0, overdue: 0 };
        }
        acc[cat].total++;
        if (reminder.status === "completed") acc[cat].completed++;
        if (reminder.status === "pending") acc[cat].pending++;
        if (reminder.status === "overdue") acc[cat].overdue++;
      }
      return acc;
    }, {} as Record<string, { total: number; pending: number; completed: number; overdue: number }>);

    const byPriority = chartData.reduce((acc, reminder) => {
      const priority = (reminder as any).priority || "medium";
      if (!acc[priority]) acc[priority] = 0;
      acc[priority]++;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: filteredData.length,
      completed: filteredData.filter((r) => r.status === "completed").length,
      pending: filteredData.filter((r) => r.status === "pending").length,
      overdue: filteredData.filter((r) => r.status === "overdue").length,
      completionRate: filteredData.length > 0
        ? Math.round((filteredData.filter((r) => r.status === "completed").length / filteredData.length) * 100)
        : 0,
      criticalCount: chartData.filter((r) => (r as any).priority === "critical").length,
      byCategory,
      byPriority,
    };
  }, [chartData, selectedCategory]);

  // Fetch all vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch("/api/vehicles?limit=10000");
      if (!res.ok) throw new Error("Failed to fetch vehicles");
      const response = await res.json();
      const vehiclesData = Array.isArray(response) ? response : response.data || [];
      setVehicles(vehiclesData);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  // Fetch meter logs for all vehicles
  const fetchMeterLogsForVehicles = useCallback(async (vehiclesList: Vehicle[]) => {
    const logsMap = new Map<string, MeterLog[]>();
    
    await Promise.all(
      vehiclesList.map(async (vehicle) => {
        try {
          const res = await fetch(`/api/meterlogs?license_plate=${vehicle.license_plate}`);
          if (res.ok) {
            const logs = await res.json();
            const parsedLogs = logs.map((log: MeterLog) => ({
              ...log,
              date: new Date(log.date),
            }));
            logsMap.set(vehicle.license_plate, parsedLogs);
          }
        } catch (error) {
          console.error(`Error fetching meter logs for ${vehicle.license_plate}:`, error);
        }
      })
    );
    
    return logsMap;
  }, []);

  // Fetch trips for all vehicles
  const fetchTripsForVehicles = useCallback(async (vehiclesList: Vehicle[]) => {
    const tripsMap = new Map<string, Trip[]>();
    
    await Promise.all(
      vehiclesList.map(async (vehicle) => {
        try {
          const res = await fetch(`/api/trips?license_plate=${vehicle.license_plate}`);
          if (res.ok) {
            const trips = await res.json();
            const parsedTrips = (Array.isArray(trips) ? trips : trips.data || []).map((trip: Trip) => ({
              ...trip,
              date: new Date(trip.date),
            }));
            tripsMap.set(vehicle.license_plate, parsedTrips);
          }
        } catch (error) {
          console.error(`Error fetching trips for ${vehicle.license_plate}:`, error);
        }
      })
    );
    
    return tripsMap;
  }, []);

  // Fetch maintenance data for entire fleet
  const fetchMaintenanceData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reminders?limit=10000`);
      if (!res.ok) {
        throw new Error(`Failed to fetch maintenance data: ${res.statusText}`);
      }

      const data = await res.json();
      setChartData(data || []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Failed to load maintenance summary. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all data for service alerts
  useEffect(() => {
    const fetchAllData = async () => {
      await fetchMaintenanceData();
      await fetchVehicles();
    };
    fetchAllData();
  }, [fetchMaintenanceData, fetchVehicles]);

  // After vehicles and maintenance data are loaded, fetch meter logs and trips
  useEffect(() => {
    if (vehicles.length > 0) {
      const fetchDistanceData = async () => {
        const [logsMap, tripsMapData] = await Promise.all([
          fetchMeterLogsForVehicles(vehicles),
          fetchTripsForVehicles(vehicles),
        ]);
        setMeterLogsMap(logsMap);
        setTripsMap(tripsMapData);
      };
      fetchDistanceData();
    }
  }, [vehicles, fetchMeterLogsForVehicles, fetchTripsForVehicles]);

  // Calculate alerts when all data is available
  useEffect(() => {
    if (vehicles.length > 0 && meterLogsMap.size > 0 && tripsMap.size > 0) {
      const completedServices = chartData.filter((r) => r.status === "completed");
      const alerts = calculateServiceAlerts(vehicles, meterLogsMap, tripsMap, completedServices);
      setServiceAlerts(alerts);
      setLoading(false);
    } else if (vehicles.length > 0 && meterLogsMap.size === 0 && tripsMap.size === 0) {
      setServiceAlerts([]);
      setLoading(false);
    }
  }, [vehicles, meterLogsMap, tripsMap, chartData]);

  const calculateServiceAlerts = useCallback((
    vehiclesList: Vehicle[],
    meterLogs: Map<string, MeterLog[]>,
    trips: Map<string, Trip[]>,
    completedServices: Reminder[]
  ): ServiceAlert[] => {
    const alerts: ServiceAlert[] = [];
    const SERVICE_INTERVAL_KM = 10000;

    for (const vehicle of vehiclesList) {
      const vehicleServices = completedServices.filter(
        (s) => s.license_plate === vehicle.license_plate
      );
      
      const sortedServices = vehicleServices.sort(
        (a, b) => new Date(b.completion_date || 0).getTime() - new Date(a.completion_date || 0).getTime()
      );
      
      const lastService = sortedServices[0];
      const lastServiceDate = lastService?.completion_date ? new Date(lastService.completion_date) : null;
      
      let lastServiceOdometer: number | null = null;
      if (lastService?.next_due_odometer) {
        lastServiceOdometer = lastService.next_due_odometer - SERVICE_INTERVAL_KM;
      }
      
      const vehicleMeterLogs = meterLogs.get(vehicle.license_plate) || [];
      const vehicleTrips = trips.get(vehicle.license_plate) || [];
      
      let distanceSinceLastService = 0;
      
      if (lastServiceDate) {
        distanceSinceLastService = getDistanceSinceDate(
          vehicleMeterLogs,
          vehicleTrips,
          lastServiceDate
        );
      } else {
        const combined = calculateCombinedDistance({
          meterLogs: vehicleMeterLogs,
          trips: vehicleTrips,
        });
        distanceSinceLastService = combined.totalDistance;
      }
      
      let alertType: "warning" | "critical" | "due_soon" = "due_soon";
      let daysOverdue: number | undefined;
      
      if (distanceSinceLastService >= SERVICE_INTERVAL_KM) {
        const kmOverdue = distanceSinceLastService - SERVICE_INTERVAL_KM;
        daysOverdue = Math.round(kmOverdue / 100);
        alertType = "critical";
      } else if (distanceSinceLastService >= SERVICE_INTERVAL_KM - 1000) {
        alertType = "warning";
      } else if (distanceSinceLastService >= SERVICE_INTERVAL_KM - 2000) {
        alertType = "due_soon";
      } else {
        continue;
      }
      
      alerts.push({
        vehicle,
        lastServiceDate,
        lastServiceOdometer,
        distanceSinceLastService,
        alertType,
        daysOverdue,
      });
    }
    
    return alerts.sort((a, b) => {
      const urgencyOrder = { critical: 0, warning: 1, due_soon: 2 };
      return urgencyOrder[a.alertType] - urgencyOrder[b.alertType];
    });
  }, []);

  // Prepare data for charts
  const chartMetrics = useMemo(() => {
    const trendsMap = new Map<
      string,
      {
        dateObj: Date;
        completed: number;
        pending: number;
        overdue: number;
      }
    >();

    // Category distribution for pie chart
    const categoryDistribution = Object.entries(stats.byCategory).map(([cat, data]) => ({
      name: categoryNames[cat as MaintenanceCategory] || cat,
      value: data.total,
      pending: data.pending,
      overdue: data.overdue,
      completed: data.completed,
    }));

    // Monthly trends
    chartData.forEach((reminder) => {
      const date = new Date(reminder.due_date);
      const monthKey = format(date, "MMM yyyy");
      const monthDate = parse(monthKey, "MMM yyyy", new Date());

      if (!trendsMap.has(monthKey)) {
        trendsMap.set(monthKey, {
          dateObj: monthDate,
          completed: 0,
          pending: 0,
          overdue: 0,
        });
      }

      const counts = trendsMap.get(monthKey)!;
      if (reminder.status === "completed") counts.completed++;
      if (reminder.status === "pending") counts.pending++;
      if (reminder.status === "overdue") counts.overdue++;
    });

    const trendsData = Array.from(trendsMap.values())
      .sort((a, b) => (isAfter(a.dateObj, b.dateObj) ? 1 : -1))
      .map(({ dateObj, ...counts }) => ({
        date: format(dateObj, "MMM yyyy"),
        ...counts,
      }));

    const statusData = Object.entries(
      chartData.reduce((acc, reminder) => {
        acc[reminder.status] = (acc[reminder.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([status, count]) => ({ status, count }));

    return {
      statusData,
      trendsData,
      categoryDistribution,
      priorityDistribution: Object.entries(stats.byPriority).map(([priority, count]) => ({ priority, count })),
    };
  }, [chartData, stats.byCategory, stats.byPriority]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            Fleet Maintenance Summary
          </h1>
          <p className="text-muted-foreground">
            Complete maintenance tracking across 6 service categories
          </p>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            selectedCategory === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All Categories
        </button>
        {Object.entries(categoryNames).map(([key, name]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              selectedCategory === key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard title="Total Services" value={stats.total} icon={<Wrench className="h-5 w-5" />} />
        <StatCard title="Completed" value={stats.completed} icon={<CalendarCheck className="h-5 w-5" />} delta={stats.completionRate} />
        <StatCard title="Pending" value={stats.pending} icon={<AlarmClockCheck className="h-5 w-5" />} />
        <StatCard title="Overdue" value={stats.overdue} icon={<AlarmClockCheck className="h-5 w-5 text-red-500" />} />
        <StatCard title="Critical Issues" value={stats.criticalCount} icon={<AlertTriangle className="h-5 w-5 text-red-500" />} />
      </div>

      {/* Category Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(stats.byCategory).map(([cat, data]) => (
          <div
            key={cat}
            className="border rounded-lg p-3 text-center hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedCategory(cat)}
          >
            <p className="text-xs text-muted-foreground">{categoryNames[cat as MaintenanceCategory]}</p>
            <p className="text-xl font-bold">{data.total}</p>
            <div className="flex justify-center gap-2 text-xs mt-1">
              {data.overdue > 0 && <span className="text-red-500">{data.overdue} overdue</span>}
              {data.pending > 0 && <span className="text-yellow-500">{data.pending} pending</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <MaintenanceCharts
          statusData={chartMetrics.statusData}
          trendsData={chartMetrics.trendsData}
        />
      )}

      {/* 10,000 km Service Alerts Section */}
      <div className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          10,000 km Service Alerts
        </h2>
        <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
          Vehicles approaching or exceeding the 10,000 km service interval
        </p>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : serviceAlerts.length === 0 ? (
          <p className="mt-4 text-green-700 dark:text-green-400 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            All vehicles are within service interval - no alerts
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {serviceAlerts.map((alert) => (
              <div
                key={alert.vehicle.license_plate}
                className={`p-4 border rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                  alert.alertType === "critical"
                    ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
                    : alert.alertType === "warning"
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800"
                    : "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-800"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-sm">
                      {alert.vehicle.license_plate}
                    </Badge>
                    <span className="font-medium">
                      {alert.vehicle.make} {alert.vehicle.model}
                    </span>
                    {alert.alertType === "critical" && (
                      <Badge variant="destructive" className="ml-2">
                        OVERDUE
                      </Badge>
                    )}
                    {alert.alertType === "warning" && (
                      <Badge variant="default" className="ml-2 bg-orange-500">
                        DUE SOON
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <p>
                      Distance since last service:{" "}
                      <span className="font-mono font-semibold">
                        {alert.distanceSinceLastService.toLocaleString()} km
                      </span>
                      {alert.distanceSinceLastService >= 10000 && (
                        <span className="text-red-600 dark:text-red-400 ml-2">
                          ({(alert.distanceSinceLastService - 10000).toLocaleString()} km over)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="whitespace-nowrap">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {alert.distanceSinceLastService >= 10000 ? "Service Required" : `${(10000 - alert.distanceSinceLastService).toLocaleString()} km to go`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Critical Overdue Reminders */}
      <div className="rounded-lg border p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlarmClockCheck className="h-5 w-5" />
          Overdue Service Reminders
        </h2>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : chartData.filter((r) => r.status === "overdue").length === 0 ? (
          <p className="mt-2 text-green-700 dark:text-green-400">
            No overdue reminders - all maintenance is up to date
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {chartData
              .filter((r) => r.status === "overdue")
              .slice(0, 6)
              .map((reminder) => (
                <div
                  key={reminder._id}
                  className="p-3 border rounded-lg bg-white dark:bg-gray-900 border-red-300 dark:border-red-800 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">{reminder.license_plate}</p>
                    <p className="text-sm">{reminder.title}</p>
                    {(reminder as any).category && (
                      <p className="text-xs text-muted-foreground">
                        {categoryNames[(reminder as any).category as MaintenanceCategory]}
                      </p>
                    )}
                  </div>
                  <Badge variant="destructive">
                    Overdue:{" "}
                    {Math.floor(
                      (new Date().getTime() -
                        new Date(reminder.due_date).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    days
                  </Badge>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}