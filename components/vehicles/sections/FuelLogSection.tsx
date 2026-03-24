"use client";

import { useEffect, useState, useCallback } from "react";
import { FuelLog, Unit } from "@/types";
import { FuelCharts } from "./fuel/FuelCharts";
import { FuelStats } from "./fuel/FuelStats";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { FuelLogForm } from "../forms/FuelLogForm";

interface ChartData {
  timeData: { date: string; volume: number }[];
  costData: { date: string; cost: number }[];
  efficiencyData: { date: string; efficiency: number }[];
}

const formatDate = (dateString: string | Date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(dateString));
};

export default function FuelLogSection({
  vehicle,
}: {
  vehicle: { license_plate: string };
}) {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [editLog, setEditLog] = useState<FuelLog | null>(null);
  const [, setLoading] = useState(false);
  const [chartData, setChartData] = useState<ChartData>({
    timeData: [],
    costData: [],
    efficiencyData: [],
  });

  const fetchFuelLogs = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/fuellogs?license_plate=${vehicle.license_plate}`
      );
      const data = await res.json();
      setLogs(data);

      const sortedLogs = [...data].sort(
        (a: FuelLog, b: FuelLog) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const timeMap = new Map<string, number>();
      const costMap = new Map<string, number>();
      const efficiencyData: { date: string; efficiency: number }[] = [];

      for (let i = 1; i < sortedLogs.length; i++) {
        const current = sortedLogs[i];
        const previous = sortedLogs[i - 1];
        const distance = current.odometer - previous.odometer;
        if (current.fuel_volume > 0) {
          efficiencyData.push({
            date: formatDate(current.date),
            efficiency: Number((distance / current.fuel_volume).toFixed(2)),
          });
        }
      }

      sortedLogs.forEach((log: FuelLog) => {
        const date = formatDate(log.date);
        timeMap.set(date, (timeMap.get(date) || 0) + log.fuel_volume);
        costMap.set(date, (costMap.get(date) || 0) + log.cost);
      });

      setChartData({
        timeData: Array.from(timeMap, ([date, volume]) => ({ date, volume })),
        costData: Array.from(costMap, ([date, cost]) => ({ date, cost })),
        efficiencyData,
      });
    } catch {
      toast.error("Failed to load fuel logs");
    }
  }, [vehicle.license_plate]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units?type=volume");
      const data = await res.json();
      setUnits(data);
    } catch {
      toast.error("Failed to load units");
    }
  }, []);

  useEffect(() => {
    fetchFuelLogs();
    fetchUnits();
  }, [fetchFuelLogs, fetchUnits]);

  // FIX: use controlled state via FuelLogForm's onSubmit callback
  // instead of reading FormData from e.currentTarget
  const handleSubmit = async (logData: {
    date: string;
    fuel_volume: number;
    cost: number;
    odometer: number;
    unit_id: string;
    license_plate: string;
  }) => {
    setLoading(true);
    try {
      const url = editLog ? `/api/fuellogs?id=${editLog._id}` : "/api/fuellogs";
      const method = editLog ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save fuel log");
      }

      toast.success(`Fuel log ${editLog ? "updated" : "added"} successfully`);
      fetchFuelLogs();
      setOpen(false);
      setEditLog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (logId: string) => {
    toast("Are you sure you want to delete this fuel log?", {
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            const res = await fetch(`/api/fuellogs?id=${logId}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete fuel log");
            toast.success("Fuel log deleted successfully");
            fetchFuelLogs();
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Delete failed"
            );
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const totalFuel = logs.reduce((sum, log) => sum + log.fuel_volume, 0);
  const totalCost = logs.reduce((sum, log) => sum + log.cost, 0);
  const averageCostPerUnit = totalFuel > 0 ? totalCost / totalFuel : 0;

  const getPrimaryUnit = () => {
    if (logs.length === 0) return null;
    const unitCounts: Record<string, number> = {};
    logs.forEach((log) => {
      unitCounts[log.unit_id] = (unitCounts[log.unit_id] || 0) + 1;
    });
    const primaryUnitId = Object.entries(unitCounts).sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    return units.find((u) => u.unit_id === primaryUnitId);
  };

  const primaryUnit = getPrimaryUnit();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Fuel Logs</h3>
        <Button onClick={() => setOpen(true)}>Add Fuel Log</Button>
      </div>

      <FuelStats
        totalFuel={totalFuel}
        totalCost={totalCost}
        averageCostPerUnit={averageCostPerUnit}
        logCount={logs.length}
        unitSymbol={primaryUnit?.symbol || ""}
      />

      <FuelCharts
        consumptionData={chartData.timeData}
        costData={chartData.costData}
        efficiencyData={chartData.efficiencyData}
        theme={theme}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>License Plate</TableHead>
            <TableHead>Fuel Volume</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Odometer</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log._id}>
              <TableCell>{formatDate(log.date)}</TableCell>
              <TableCell>{log.license_plate}</TableCell>
              <TableCell>{log.fuel_volume}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {log.unit?.symbol ||
                    units.find((u) => u.unit_id === log.unit_id)?.symbol}
                </Badge>
              </TableCell>
              <TableCell>${Number(log.cost).toFixed(2)}</TableCell>
              <TableCell>{log.odometer.toLocaleString()}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditLog(log);
                      setOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => log._id && handleDelete(log._id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditLog(null);
          setOpen(isOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editLog ? "Edit Fuel Log" : "New Fuel Log"}
            </DialogTitle>
          </DialogHeader>
          <FuelLogForm
            initialData={editLog ?? undefined}
            license_plate={vehicle.license_plate}
            units={units}
            onSubmit={handleSubmit}
            onCancel={() => {
              setOpen(false);
              setEditLog(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
