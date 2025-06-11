// src/app/(dashboard)/dashboard/maintenance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/vehicles/sections/maintenance/AnalyticsComponents";
import { MaintenanceCharts } from "@/components/vehicles/sections/maintenance/MaintenanceCharts";
import { Wrench, CalendarCheck, AlarmClockCheck } from "lucide-react";
import { toast } from "sonner";
import type { Reminder } from "@/types";
import { format, parse, isAfter } from "date-fns";

export default function FleetMaintenanceSummary() {
  const [chartData, setChartData] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculate crucial maintenance statistics
  const stats = useMemo(
    () => ({
      total: chartData.length,
      completed: chartData.filter((r) => r.status === "completed").length,
      pending: chartData.filter((r) => r.status === "pending").length,
      overdue: chartData.filter((r) => r.status === "overdue").length,
      completionRate:
        chartData.length > 0
          ? Math.round(
              (chartData.filter((r) => r.status === "completed").length /
                chartData.length) *
                100
            )
          : 0,
      avgCompletionDays:
        chartData.length > 0
          ? Math.round(
              chartData
                .filter((r) => r.completion_date && r.due_date)
                .reduce((sum, r) => {
                  const due = new Date(r.due_date).getTime();
                  const completed = new Date(r.completion_date!).getTime();
                  return (
                    sum +
                    Math.max(
                      0,
                      Math.round((completed - due) / (1000 * 60 * 60 * 24))
                    )
                  );
                }, 0) / chartData.length
            )
          : 0,
    }),
    [chartData]
  );

  // Prepare data for charts with months in ascending order
  const chartMetrics = useMemo(() => {
    // Create a map for the trends data
    const trendsMap = new Map<
      string,
      {
        dateObj: Date;
        completed: number;
        pending: number;
        overdue: number;
      }
    >();

    // Aggregate data by month
    chartData.forEach((reminder) => {
      const date = new Date(reminder.due_date);
      const monthKey = format(date, "MMM yyyy");

      // Create a date object for the first day of the month
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

    // Convert to array and sort by date object
    const trendsData = Array.from(trendsMap.values())
      .sort((a, b) => (isAfter(a.dateObj, b.dateObj) ? 1 : -1))
      .map(({ dateObj, ...counts }) => ({
        date: format(dateObj, "MMM yyyy"),
        ...counts,
      }));

    // Status distribution data
    const statusData = Object.entries(
      chartData.reduce((acc, reminder) => {
        acc[reminder.status] = (acc[reminder.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([status, count]) => ({ status, count }));

    return {
      statusData,
      trendsData,
    };
  }, [chartData]);

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
      toast.error(
        "Failed to load maintenance summary. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaintenanceData();
  }, [fetchMaintenanceData]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            Fleet Maintenance Summary
          </h1>
          <p className="text-muted-foreground">
            Key maintenance metrics across all vehicles
          </p>
        </div>
      </div>

      {/* Crucial Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="Total Services"
          value={stats.total}
          icon={<Wrench className="h-5 w-5" />}
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={<CalendarCheck className="h-5 w-5" />}
          delta={stats.completionRate}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={<AlarmClockCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Overdue"
          value={stats.overdue}
          icon={<AlarmClockCheck className="h-5 w-5 text-red-500" />}
        />
        <StatCard
          title="Avg. Delay"
          value={stats.avgCompletionDays}
          icon={<CalendarCheck className="h-5 w-5 text-amber-500" />}
        />
      </div>

      {/* Crucial Maintenance Charts */}
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

      {/* Critical Alerts Section */}
      <div className="rounded-lg border p-4 bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <AlarmClockCheck className="h-5 w-5" />
          Critical Maintenance Alerts
        </h2>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : chartData.filter((r) => r.status === "overdue").length === 0 ? (
          <p className="mt-2 text-green-700">
            No critical alerts - all maintenance is up to date
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {chartData
              .filter((r) => r.status === "overdue")
              .slice(0, 4)
              .map((reminder) => (
                <div
                  key={reminder._id}
                  className="p-3 border rounded-lg bg-white border-red-300 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">{reminder.license_plate}</p>
                    <p className="text-sm">{reminder.title}</p>
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
