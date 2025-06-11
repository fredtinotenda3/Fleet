/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MeterLog, Unit } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TimeSeriesChart,
  UnitDistributionChart,
  UnitUsageOverTimeChart,
} from "@/components/vehicles/sections/meter/Charts";
import { Badge } from "@/components/ui/badge";
import {
  GaugeIcon,
  CalendarIcon,
  Download,
  Printer,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// @ts-ignore
import { CSVLink } from "react-csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 50;
const CARD_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
];

interface ApiMeterLog extends Omit<MeterLog, "date"> {
  date: string;
}

function StatCard({
  icon,
  title,
  value,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description?: string;
  color: string;
}) {
  return (
    <div
      className={cn(
        "p-6 rounded-lg border transition-all hover:shadow-md",
        color
      )}
    >
      <div className="flex items-center gap-4">
        <div className="p-2 rounded-full bg-background">{icon}</div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <p className="text-2xl font-bold">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AllMeterLogsPage() {
  const router = useRouter();
  const [data, setData] = useState<MeterLog[]>([]);
  const [chartData, setChartData] = useState<MeterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const parseMeterLogs = useCallback((apiData: ApiMeterLog[]): MeterLog[] => {
    return apiData.map((log) => ({
      ...log,
      date: new Date(log.date),
    }));
  }, []);

  const fetchMeterLogs = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: PAGE_SIZE.toString(),
          search: searchTerm,
          ...(selectedUnit !== "all" && { unit_id: selectedUnit }),
          ...(startDate && { start: startDate.toISOString() }),
          ...(endDate && { end: endDate.toISOString() }),
        });

        const res = await fetch(`/api/meterlogs?${params}`);
        if (!res.ok) throw new Error("Failed to fetch meter logs");

        const response: ApiMeterLog[] = await res.json();
        const parsedData = parseMeterLogs(response);
        setData(parsedData);

        const totalCount = res.headers.get("X-Total-Count");
        setTotalPages(
          totalCount ? Math.ceil(Number(totalCount) / PAGE_SIZE) : 1
        );
      } catch (error) {
        toast.error("Error loading meter logs");
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [searchTerm, selectedUnit, startDate, endDate, parseMeterLogs]
  );

  const fetchChartData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        ...(selectedUnit !== "all" && { unit_id: selectedUnit }),
        ...(startDate && { start: startDate.toISOString() }),
        ...(endDate && { end: endDate.toISOString() }),
      });

      const res = await fetch(`/api/meterlogs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      const response: ApiMeterLog[] = await res.json();
      const parsedData = parseMeterLogs(response);
      setChartData(parsedData);
    } catch (error) {
      toast.error("Error loading chart data");
      setChartData([]);
    }
  }, [searchTerm, selectedUnit, startDate, endDate, parseMeterLogs]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units?type=distance");
      if (!res.ok) throw new Error("Failed to fetch units");
      const units: Unit[] = await res.json();
      setUnits(units);
    } catch (error) {
      console.error("Failed to fetch units:", error);
      setUnits([]);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setCurrentPage(1);
      fetchMeterLogs(1);
      fetchChartData();
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [
    fetchMeterLogs,
    fetchChartData,
    searchTerm,
    selectedUnit,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    fetchMeterLogs(currentPage);
  }, [currentPage, fetchMeterLogs]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const { timeSeries, unitDistribution, unitUsageOverTime } = useMemo(() => {
    // Time series data (odometer readings over time)
    const timeMap = new Map<string, number>();

    // Unit distribution data
    const unitMap = new Map<string, number>();

    // Unit usage over time data
    const usageMap = new Map<string, Record<string, number>>();

    chartData.forEach((log) => {
      const dateKey = format(log.date, "yyyy-MM-dd");
      const unitName =
        units.find((u) => u.unit_id === log.unit_id)?.name || "Unknown";

      // Time series - average odometer per day
      const currentTotal = timeMap.get(dateKey) || 0;
      const count = (timeMap.get(`${dateKey}_count`) || 0) + 1;
      timeMap.set(dateKey, currentTotal + log.odometer);
      timeMap.set(`${dateKey}_count`, count);

      // Unit distribution
      unitMap.set(unitName, (unitMap.get(unitName) || 0) + 1);

      // Unit usage over time
      if (!usageMap.has(dateKey)) usageMap.set(dateKey, {});
      const entry = usageMap.get(dateKey)!;
      entry[unitName] = (entry[unitName] || 0) + 1;
    });

    // Process time series to get average per day
    const timeSeriesData = Array.from(timeMap.keys())
      .filter((key) => !key.endsWith("_count"))
      .map((dateKey) => {
        const total = timeMap.get(dateKey) || 0;
        const count = timeMap.get(`${dateKey}_count`) || 1;
        return {
          date: format(new Date(dateKey), "MMM dd"),
          reading: total / count,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Process unit distribution
    const unitDistributionData = Array.from(unitMap, ([name, count]) => ({
      name,
      total: count,
    }));

    // Process unit usage over time - FIXED TYPE ISSUE HERE
    const unitUsageOverTimeData = Array.from(usageMap, ([date, counts]) => {
      const entry: { [key: string]: string | number; date: string } = {
        date: format(new Date(date), "MMM dd"),
      };
      Object.entries(counts).forEach(([unit, count]) => {
        entry[unit] = count;
      });
      return entry;
    });

    return {
      timeSeries: timeSeriesData,
      unitDistribution: unitDistributionData,
      unitUsageOverTime: unitUsageOverTimeData,
    };
  }, [chartData, units]);

  const stats = useMemo(() => {
    const totalLogs = chartData.length;
    const uniqueVehicles = new Set(chartData.map((log) => log.license_plate))
      .size;

    const allDates = chartData
      .map((log) => log.date)
      .filter((d) => d instanceof Date && !isNaN(d.getTime()));

    const uniqueDates = Array.from(
      new Set(allDates.map((d) => d.getTime()))
    ).map((t) => new Date(t));

    const dailyAvg =
      uniqueDates.length > 0 ? totalLogs / uniqueDates.length : 0;

    return {
      totalLogs,
      uniqueVehicles,
      dailyAvg,
    };
  }, [chartData]);

  const exportData = useMemo(() => {
    const headers = [
      { label: "Vehicle", key: "license_plate" },
      { label: "Date", key: "date" },
      { label: "Odometer", key: "odometer" },
      { label: "Unit", key: "unit_name" },
    ];

    return {
      data: data.map((log) => ({
        ...log,
        date: format(log.date, "yyyy-MM-dd"),
        unit_name:
          units.find((u) => u.unit_id === log.unit_id)?.name || "Unknown",
      })),
      headers,
    };
  }, [data, units]);

  const printSummary = () => {
    const printWindow = window.open("", "_blank");
    printWindow?.document.write(`
      <html>
        <head>
          <title>Meter Log Report Summary</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { color: #1a365d; }
            .stats { display: grid; gap: 20px; margin-bottom: 30px; }
            .chart { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Meter Log Report Summary</h1>
          <div class="stats">
            <div>
              <h3>Total Logs</h3>
              <p>${stats.totalLogs}</p>
            </div>
            <div>
              <h3>Vehicles Tracked</h3>
              <p>${stats.uniqueVehicles}</p>
            </div>
            <div>
              <h3>Daily Average</h3>
              <p>${stats.dailyAvg.toFixed(2)} logs/day</p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow?.document.close();
    printWindow?.print();
  };

  const DatePicker = ({
    date,
    setDate,
    label,
  }: {
    date: Date | undefined;
    setDate: (date?: Date) => void;
    label: string;
  }) => (
    <div className="flex-1">
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "MMM dd, yyyy") : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
            className="rounded-md border"
          />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GaugeIcon className="h-6 w-6 text-blue-600" />
          All Vehicles Meter Logs Analytics
        </h1>
        <div className="w-full md:w-auto flex gap-2">
          <Input
            placeholder="Search meter logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
          <div className="flex gap-2">
            <CSVLink {...exportData} filename="meter-logs-report.csv">
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
              <label className="text-sm font-medium mb-1 block">Unit</label>
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
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<GaugeIcon className="h-6 w-6" />}
          title="Total Logs"
          value={stats.totalLogs.toLocaleString()}
          color={CARD_COLORS[0]}
          description="Across all vehicles"
        />
        <StatCard
          icon={<CalendarIcon className="h-6 w-6" />}
          title="Daily Average"
          value={stats.dailyAvg.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}
          color={CARD_COLORS[1]}
          description="Logs per day"
        />
        <StatCard
          icon={<GaugeIcon className="h-6 w-6" />}
          title="Vehicles Tracked"
          value={stats.uniqueVehicles.toLocaleString()}
          color={CARD_COLORS[2]}
          description="With meter logs"
        />
      </div>

      <div className="hidden md:flex flex-wrap gap-4">
        <DatePicker
          date={startDate}
          setDate={setStartDate}
          label="Start Date"
        />
        <DatePicker date={endDate} setDate={setEndDate} label="End Date" />
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Unit</label>
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
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Odometer Trend</h3>
          </div>
          <div className="h-64">
            <TimeSeriesChart
              data={timeSeries}
              color="#2563eb"
              labelColor="#000000"
            />
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Unit Distribution</h3>
          </div>
          <div className="h-64">
            <UnitDistributionChart
              data={unitDistribution}
              colors={["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6"]}
            />
          </div>
        </div>

        <div className="p-4 border rounded-lg col-span-full">
          <h3 className="text-lg font-semibold mb-4">Unit Usage Over Time</h3>
          <div className="h-96">
            <UnitUsageOverTimeChart
              data={unitUsageOverTime}
              colors={["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6"]}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Odometer</TableHead>
              <TableHead>Unit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-4 text-muted-foreground"
                >
                  <GaugeIcon className="mx-auto h-8 w-8 mb-2" />
                  No meter logs found matching your criteria
                </TableCell>
              </TableRow>
            ) : (
              data.map((log) => {
                const unit = units.find((u) => u.unit_id === log.unit_id);
                return (
                  <TableRow
                    key={log._id}
                    onClick={() =>
                      router.push(
                        `/vehicles?selectedVehicle=${log.license_plate}`
                      )
                    }
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {log.license_plate}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(log.date, "MMM dd, yyyy")}</TableCell>
                    <TableCell>{log.odometer.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800">
                        {unit?.name || "Unknown"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
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
}
