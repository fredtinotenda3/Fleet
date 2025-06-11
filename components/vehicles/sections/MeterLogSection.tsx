/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { MeterLogsTable } from "./meter/MeterLogsTable";
import { MeterLogForm } from "./meter/MeterLogForm";
import {
  TimeSeriesChart,
  UnitDistributionChart,
  UnitUsageOverTimeChart,
} from "./meter/Charts";
import { StatsDisplay } from "./meter/Stats";
import { MeterLog, Unit } from "@/types/index";
import { Button } from "@/components/ui/button";

export default function MeterLogSection({
  vehicle,
}: {
  vehicle: { license_plate: string };
}) {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<MeterLog[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [editLog, setEditLog] = useState<MeterLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>(
    {}
  );
  const [chartData, setChartData] = useState<{
    timeSeries: { date: string; reading: number }[];
    unitDistribution: { name: string; total: number }[];
    unitUsageOverTime: { date: string; [key: string]: number | string }[];
  }>({ timeSeries: [], unitDistribution: [], unitUsageOverTime: [] });

  const colors =
    theme === "dark"
      ? ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#9333ea"]
      : ["#60a5fa", "#4ade80", "#f87171", "#fb923c", "#a855f7"];

  const fetchMeterLogs = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/meterlogs?license_plate=${vehicle.license_plate}`
      );
      if (!res.ok) throw new Error("Failed to fetch meter logs");
      const data = await res.json();
      const parsedLogs = data.map((log: MeterLog) => ({
        ...log,
        date: new Date(log.date),
      }));
      setLogs(parsedLogs);
    } catch (error: any) {
      toast.error(error.message);
    }
  }, [vehicle.license_plate]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units?type=distance");
      if (!res.ok) throw new Error("Failed to fetch units");
      const data = await res.json();
      setUnits(data);
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    fetchMeterLogs();
    fetchUnits();
  }, [fetchMeterLogs, fetchUnits]);

  useEffect(() => {
    const processChartData = () => {
      const filtered = logs
        .filter((log) => {
          const logDate = new Date(log.date);
          return (
            (!dateRange.start || logDate >= new Date(dateRange.start)) &&
            (!dateRange.end || logDate <= new Date(dateRange.end))
          );
        })
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

      const timeMap = new Map<string, number>();
      const unitMap = new Map<string, number>();
      const usageMap = new Map<string, Record<string, number>>();

      filtered.forEach((log) => {
        const date = new Date(log.date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        // Time series data
        timeMap.set(date, log.odometer);

        // Unit distribution data
        const unitName =
          units.find((u) => u.unit_id === log.unit_id)?.name || "Unknown";
        unitMap.set(unitName, (unitMap.get(unitName) || 0) + log.odometer);

        // Unit usage over time data
        if (!usageMap.has(date)) usageMap.set(date, {});
        const entry = usageMap.get(date)!;
        entry[unitName] = (entry[unitName] || 0) + log.odometer;
      });

      // Calculate cumulative usage
      const usageData: { date: string; [key: string]: number | string }[] = [];
      const cumulative: Record<string, number> = {};
      Array.from(usageMap.entries()).forEach(([date, d]) => {
        // Copy d to avoid mutating the map's original data
        const newEntry: { date: string; [key: string]: number | string } = {
          date,
        };
        Object.keys(d).forEach((k) => {
          cumulative[k] = (cumulative[k] || 0) + d[k];
          newEntry[k] = cumulative[k];
        });
        usageData.push(newEntry);
      });

      setChartData({
        timeSeries: Array.from(timeMap, ([date, reading]) => ({
          date,
          reading,
        })),
        unitDistribution: Array.from(unitMap, ([name, total]) => ({
          name,
          total,
        })),
        unitUsageOverTime: usageData,
      });
    };

    if (logs.length > 0 && units.length > 0) {
      processChartData();
    }
  }, [logs, units, dateRange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const payload = {
        license_plate: vehicle.license_plate,
        date: formData.get("date")?.toString() || "",
        odometer: Number(formData.get("odometer")),
        unit_id: formData.get("unit_id")?.toString() || "",
      };

      // Validation
      if (!payload.date || isNaN(payload.odometer) || !payload.unit_id) {
        throw new Error("All fields are required");
      }

      const url = editLog?._id
        ? `/api/meterlogs?id=${editLog._id}`
        : "/api/meterlogs";

      const method = editLog?._id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Operation failed");
      }

      toast.success(`Log ${editLog?._id ? "updated" : "created"} successfully`);
      fetchMeterLogs();
      setOpen(false);
      setEditLog(null);
    } catch (error: any) {
      toast.error(error.message || "Error saving log");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm("Permanently delete this meter log?")) return;

    try {
      const res = await fetch(`/api/meterlogs?id=${logId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Delete failed");
      }

      toast.success("Log deleted successfully");
      fetchMeterLogs();
    } catch (error: any) {
      toast.error(error.message || "Delete error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-primary">📈 Meter Logs</h3>
        <Button
          className="bg-primary text-white hover:bg-primary/90"
          onClick={() => setOpen(true)}
        >
          + Add Log
        </Button>
      </div>

      <StatsDisplay logs={logs} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Odometer Trend Chart */}
        <div className="p-4 border rounded-lg bg-muted/20 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              🚗 Odometer Trend
            </h3>
          </div>
          <div className="h-64">
            <TimeSeriesChart
              data={chartData.timeSeries}
              color={colors[0]}
              labelColor={theme === "dark" ? "#ffffff" : "#000000"}
            />
          </div>
        </div>

        {/* Unit Distribution Chart */}
        <div className="p-4 border rounded-lg bg-muted/20 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">
              📊 Unit Distribution
            </h3>
          </div>
          <div className="h-64">
            <UnitDistributionChart
              data={chartData.unitDistribution}
              colors={colors}
            />
          </div>
        </div>

        {/* Unit Usage Over Time */}
        <div className="p-4 border rounded-lg col-span-full bg-muted/20 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">
            📈 Unit Usage Over Time
          </h3>
          <div className="h-96">
            <UnitUsageOverTimeChart
              data={chartData.unitUsageOverTime}
              colors={colors}
            />
          </div>
        </div>
      </div>

      <MeterLogsTable
        logs={logs}
        units={units}
        setEditLog={setEditLog}
        setOpen={setOpen}
        handleDelete={handleDelete}
      />

      <MeterLogForm
        open={open}
        setOpen={setOpen}
        editLog={editLog}
        setEditLog={setEditLog}
        loading={loading}
        handleSubmit={handleSubmit}
        units={units}
      />
    </div>
  );
}
