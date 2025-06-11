/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
// components/vehicles/sections/fuel/FuelLogsAnalytics.tsx
"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FuelCharts } from "./FuelCharts";
import { VehicleComparisonCharts } from "./VehicleComparisonCharts";
import { FuelLogTable } from "../../tables/FuelLogTable";
import { DatePicker, StatCard } from "./AnalyticsComponents";
import { formatDate, calculateEfficiency } from "@/lib/utils";
import { FuelLog, Unit, Vehicle } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, Sliders, FuelIcon, GaugeIcon, Printer } from "lucide-react";
// @ts-ignore
import { CSVLink } from "react-csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const CARD_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-amber-100 text-amber-800",
];

export const FuelLogsAnalytics = () => {
  const router = useRouter();
  const [data, setData] = useState<FuelLog[]>([]);
  const [chartData, setChartData] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const parseFuelLogs = useCallback((apiData: FuelLog[]): FuelLog[] => {
    return apiData.map((log) => ({
      ...log,
      date: new Date(log.date),
    }));
  }, []);

  const fetchFuelLogs = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: PAGE_SIZE.toString(),
          search: searchTerm,
          ...(selectedUnit !== "all" && { unit: selectedUnit }),
          ...(startDate && { start: startDate.toISOString() }),
          ...(endDate && { end: endDate.toISOString() }),
        });

        const res = await fetch(`/api/fuellogs?${params}`);
        if (!res.ok) throw new Error("Failed to fetch fuel logs");

        const response = await res.json();
        const parsedData = parseFuelLogs(response);
        setData(parsedData);

        const totalCount = res.headers.get("X-Total-Count");
        setTotalPages(
          totalCount ? Math.ceil(Number(totalCount) / PAGE_SIZE) : 1
        );
      } catch (error) {
        toast.error("Error loading fuel logs");
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [searchTerm, selectedUnit, startDate, endDate, parseFuelLogs]
  );

  const fetchChartData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        ...(selectedUnit !== "all" && { unit: selectedUnit }),
        ...(startDate && { start: startDate.toISOString() }),
        ...(endDate && { end: endDate.toISOString() }),
      });

      const res = await fetch(`/api/fuellogs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      const response = await res.json();
      const parsedData = parseFuelLogs(response);
      setChartData(parsedData);
    } catch (error) {
      toast.error("Error loading chart data");
      setChartData([]);
    }
  }, [searchTerm, selectedUnit, startDate, endDate, parseFuelLogs]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch("/api/vehicles");
      const data = await res.json();
      setVehicles(data);
    } catch (error) {
      console.error("Failed to fetch vehicles:", error);
    }
  }, []);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units?type=volume");
      const units = await res.json();
      setUnits(units);
    } catch (error) {
      console.error("Failed to fetch units:", error);
      setUnits([]);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setCurrentPage(1);
      fetchFuelLogs(1);
      fetchChartData();
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [
    fetchFuelLogs,
    fetchChartData,
    searchTerm,
    selectedUnit,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    fetchFuelLogs(currentPage);
  }, [currentPage, fetchFuelLogs]);

  useEffect(() => {
    fetchVehicles();
    fetchUnits();
  }, [fetchVehicles, fetchUnits]);

  const aggregatedData = useMemo(() => {
    // Consumption and cost over time
    const consumptionData = chartData.reduce((acc, log) => {
      const dateKey = formatDate(log.date, "MMM dd");
      acc[dateKey] = (acc[dateKey] || 0) + log.fuel_volume;
      return acc;
    }, {} as Record<string, number>);

    const costData = chartData.reduce((acc, log) => {
      const dateKey = formatDate(log.date, "MMM dd");
      acc[dateKey] = (acc[dateKey] || 0) + log.cost;
      return acc;
    }, {} as Record<string, number>);

    // Efficiency over time
    const efficiencyData = Array.from(calculateEfficiency(chartData)).map(
      ([date, efficiency]) => ({
        date: formatDate(date, "MMM dd"),
        efficiency,
      })
    );

    // Vehicle-based analytics
    const consumptionByVehicle: Record<string, number> = {};
    const costByVehicle: Record<string, number> = {};
    const efficiencyByVehicle: Record<string, number> = {};
    const fuelVolumeByVehicle: Record<string, number> = {};
    const fuelCostByVehicle: Record<string, number> = {};

    // Group logs by vehicle
    const logsByVehicle: Record<string, FuelLog[]> = {};
    chartData.forEach((log) => {
      if (!logsByVehicle[log.license_plate]) {
        logsByVehicle[log.license_plate] = [];
      }
      logsByVehicle[log.license_plate].push(log);
    });

    // Calculate metrics per vehicle
    Object.entries(logsByVehicle).forEach(([licensePlate, logs]) => {
      // Sort logs by date
      logs.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Consumption
      consumptionByVehicle[licensePlate] = logs.reduce(
        (sum, log) => sum + log.fuel_volume,
        0
      );

      // Cost
      costByVehicle[licensePlate] = logs.reduce(
        (sum, log) => sum + log.cost,
        0
      );

      // Efficiency
      if (logs.length > 1) {
        const distance = logs[logs.length - 1].odometer - logs[0].odometer;
        const totalFuel = logs.reduce((sum, log) => sum + log.fuel_volume, 0);
        efficiencyByVehicle[licensePlate] = distance / totalFuel;
      }

      // Fuel volume vs cost
      fuelVolumeByVehicle[licensePlate] = consumptionByVehicle[licensePlate];
      fuelCostByVehicle[licensePlate] = costByVehicle[licensePlate];
    });

    return {
      consumptionData,
      costData,
      efficiencyData,
      consumptionByVehicle,
      costByVehicle,
      efficiencyByVehicle,
      fuelVolumeByVehicle,
      fuelCostByVehicle,
    };
  }, [chartData]);

  const stats = useMemo(() => {
    const totalFuel = chartData.reduce((sum, log) => sum + log.fuel_volume, 0);
    const totalCost = chartData.reduce((sum, log) => sum + log.cost, 0);
    const averageCostPerUnit = totalFuel > 0 ? totalCost / totalFuel : 0;
    const entries = chartData.length;

    return {
      totalFuel: totalFuel.toFixed(2),
      totalCost: `$${totalCost.toFixed(2)}`,
      averageCostPerUnit: `$${averageCostPerUnit.toFixed(2)}`,
      entries: entries.toString(),
    };
  }, [chartData]);

  const exportData = useMemo(
    () => ({
      data: data.map((log) => ({
        ...log,
        date: formatDate(log.date),
        cost: `$${log.cost.toFixed(2)}`,
        unit: units.find((u) => u.unit_id === log.unit_id)?.symbol || "N/A",
      })),
      headers: [
        { label: "Date", key: "date" },
        { label: "Vehicle", key: "license_plate" },
        { label: "Fuel Volume", key: "fuel_volume" },
        { label: "Unit", key: "unit" },
        { label: "Cost", key: "cost" },
        { label: "Odometer", key: "odometer" },
      ],
    }),
    [data, units]
  );

  const printSummary = () => {
    const printWindow = window.open("", "_blank");
    printWindow?.document.write(`
      <html>
        <head>
          <title>Fuel Logs Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { color: #1a365d; }
            .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
            .stat-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Fuel Logs Report</h1>
          
          <div class="stats">
            <div class="stat-card">
              <h3>Total Fuel</h3>
              <p>${stats.totalFuel}</p>
            </div>
            <div class="stat-card">
              <h3>Total Cost</h3>
              <p>${stats.totalCost}</p>
            </div>
            <div class="stat-card">
              <h3>Avg Cost/Unit</h3>
              <p>${stats.averageCostPerUnit}</p>
            </div>
            <div class="stat-card">
              <h3>Entries</h3>
              <p>${stats.entries}</p>
            </div>
          </div>
          
          <h2>Fuel Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Fuel Volume</th>
                <th>Unit</th>
                <th>Cost</th>
                <th>Odometer</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (log) => `
                <tr>
                  <td>${formatDate(log.date)}</td>
                  <td>${log.license_plate}</td>
                  <td>${log.fuel_volume}</td>
                  <td>${
                    units.find((u) => u.unit_id === log.unit_id)?.symbol ||
                    "N/A"
                  }</td>
                  <td>$${log.cost.toFixed(2)}</td>
                  <td>${log.odometer}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow?.document.close();
    printWindow?.print();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FuelIcon className="h-6 w-6 text-blue-600" />
          Fuel Logs Analytics
        </h1>
        <div className="w-full md:w-auto flex gap-2">
          <Input
            placeholder="Search fuel logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
          <div className="flex gap-2">
            <CSVLink {...exportData} filename="fuel-logs-report.csv">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </CSVLink>
            <Button variant="outline" size="sm" onClick={printSummary}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<FuelIcon className="h-6 w-6" />}
          title="Total Fuel"
          value={stats.totalFuel}
          color={CARD_COLORS[0]}
        />
        <StatCard
          icon={<GaugeIcon className="h-6 w-6" />}
          title="Total Cost"
          value={stats.totalCost}
          color={CARD_COLORS[1]}
        />
        <StatCard
          icon={<FuelIcon className="h-6 w-6" />}
          title="Avg Cost/Unit"
          value={stats.averageCostPerUnit}
          color={CARD_COLORS[2]}
        />
        <StatCard
          icon={<GaugeIcon className="h-6 w-6" />}
          title="Entries"
          value={stats.entries}
          color={CARD_COLORS[3]}
        />
      </div>

      <div className="md:hidden">
        <DropdownMenu onOpenChange={setShowMobileFilters}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full">
              <Sliders className="h-4 w-4 mr-2" />
              {showMobileFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[calc(100vw-2rem)] p-4 space-y-4">
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              label="Start Date"
            />
            <DatePicker date={endDate} setDate={setEndDate} label="End Date" />
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">
                Fuel Unit
              </label>
              <Select
                value={selectedUnit}
                onValueChange={(value) => setSelectedUnit(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Units</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.unit_id} value={unit.unit_id}>
                      {unit.symbol} ({unit.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden md:flex flex-wrap gap-4">
        <DatePicker
          date={startDate}
          setDate={setStartDate}
          label="Start Date"
        />
        <DatePicker date={endDate} setDate={setEndDate} label="End Date" />
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Fuel Unit</label>
          <Select
            value={selectedUnit}
            onValueChange={(value) => setSelectedUnit(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.unit_id} value={unit.unit_id}>
                  {unit.symbol} ({unit.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <FuelCharts
        consumptionData={Object.entries(aggregatedData.consumptionData).map(
          ([date, volume]) => ({ date, volume })
        )}
        costData={Object.entries(aggregatedData.costData).map(
          ([date, cost]) => ({ date, cost })
        )}
        efficiencyData={aggregatedData.efficiencyData}
      />

      <h2 className="text-xl font-bold mt-8">Vehicle Comparison</h2>
      <VehicleComparisonCharts
        consumptionByVehicle={aggregatedData.consumptionByVehicle}
        costByVehicle={aggregatedData.costByVehicle}
        efficiencyByVehicle={aggregatedData.efficiencyByVehicle}
        fuelVolumeByVehicle={aggregatedData.fuelVolumeByVehicle}
        fuelCostByVehicle={aggregatedData.fuelCostByVehicle}
        vehicles={vehicles}
      />

      <div className="rounded-lg border">
        <FuelLogTable
          logs={data}
          units={units}
          onEdit={(log) =>
            router.push(`/vehicles?selectedVehicle=${log.license_plate}`)
          }
          onDelete={() => {}}
          loading={loading}
        />
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <Button
            variant="outline"
            disabled={currentPage === 1 || loading}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={currentPage === totalPages || loading}
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};
