/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wrench, CalendarCheck, AlarmClockCheck } from "lucide-react";
import { toast } from "sonner";
import {
  DatePicker,
  StatCard,
  PaginationControls,
} from "@/components/vehicles/sections/maintenance/AnalyticsComponents";
import { MaintenanceCharts } from "@/components/vehicles/sections/maintenance/MaintenanceCharts";
import type { Reminder } from "@/types";
import { format } from "date-fns";

const PAGE_SIZE = 10;

export default function MaintenanceAnalyticsPage() {
  const [chartData, setChartData] = useState<Reminder[]>([]);
  const [tableData, setTableData] = useState<Reminder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    page: 1,
  });

  const statusData = useMemo(() => {
    const counts = chartData.reduce((acc, reminder) => {
      acc[reminder.status] = (acc[reminder.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [chartData]);

  const trendsData = useMemo(() => {
    const grouped = chartData.reduce((acc, reminder) => {
      const date = new Date(reminder.due_date);
      const month = format(date, "MMM yyyy");
      if (!acc[month]) {
        acc[month] = { completed: 0, pending: 0, overdue: 0 };
      }
      if (reminder.status === "completed") acc[month].completed++;
      if (reminder.status === "pending") acc[month].pending++;
      if (reminder.status === "overdue") acc[month].overdue++;
      return acc;
    }, {} as Record<string, { completed: number; pending: number; overdue: number }>);

    return Object.entries(grouped)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [chartData]);

  const stats = useMemo(
    () => ({
      total: chartData.length,
      completed: chartData.filter((r) => r.status === "completed").length,
      pending: chartData.filter((r) => r.status === "pending").length,
      overdue: chartData.filter((r) => r.status === "overdue").length,
      completionRate:
        chartData.length > 0
          ? (chartData.filter((r) => r.status === "completed").length /
              chartData.length) *
            100
          : 0,
    }),
    [chartData]
  );

  const fetchChartData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        search: filters.search,
        status: filters.status,
        ...(filters.startDate && { start: filters.startDate.toISOString() }),
        ...(filters.endDate && { end: filters.endDate.toISOString() }),
      });

      // Fetch data for entire fleet (no license plate filter)
      const res = await fetch(`/api/reminders?${params}`);
      if (!res.ok) throw new Error("Failed to fetch maintenance stats");

      const data = await res.json();
      setChartData(data || []);
    } catch (error) {
      toast.error("Failed to load maintenance stats");
    }
  }, [filters.search, filters.status, filters.startDate, filters.endDate]);

  const fetchTableData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: filters.search,
        status: filters.status,
        page: filters.page.toString(),
        limit: PAGE_SIZE.toString(),
        ...(filters.startDate && { start: filters.startDate.toISOString() }),
        ...(filters.endDate && { end: filters.endDate.toISOString() }),
      });

      // Fetch paginated data for entire fleet
      const res = await fetch(`/api/reminders?${params}`);
      if (!res.ok) throw new Error("Failed to fetch maintenance data");

      const data = await res.json();
      setTableData(data || []);

      // Get total count from headers
      const total = res.headers.get("X-Total-Count");
      setTotalCount(Number(total) || 0);
    } catch (error) {
      toast.error("Failed to load maintenance data");
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.search,
    filters.status,
    filters.startDate,
    filters.endDate,
  ]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchChartData();
      if (filters.page === 1) fetchTableData();
    }, 500);
    return () => clearTimeout(debounce);
  }, [fetchChartData, filters.page, fetchTableData]);

  useEffect(() => {
    if (filters.page !== 1) setFilters((prev) => ({ ...prev, page: 1 }));
  }, [filters.search, filters.status, filters.startDate, filters.endDate]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            Fleet Maintenance Analytics
          </h1>
          <p className="text-muted-foreground">
            Historical service data and performance metrics for entire fleet
          </p>
        </div>
        <div className="flex gap-2">
          <DatePicker
            selected={filters.startDate}
            onSelect={(d) => setFilters((prev) => ({ ...prev, startDate: d }))}
            placeholder="Start Date"
            label="Start Date"
          />
          <DatePicker
            selected={filters.endDate}
            onSelect={(d) => setFilters((prev) => ({ ...prev, endDate: d }))}
            placeholder="End Date"
            label="End Date"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Services"
          value={stats.total}
          icon={<Wrench className="h-5 w-5" />}
          delta={stats.completionRate}
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={<CalendarCheck className="h-5 w-5" />}
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
      </div>

      <MaintenanceCharts statusData={statusData} trendsData={trendsData} />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Input
            placeholder="Search services..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className="max-w-sm"
          />
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, status: v }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
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
                    <Skeleton className="h-4 w-[150px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[200px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : tableData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No results found
                </TableCell>
              </TableRow>
            ) : (
              tableData.map((reminder) => (
                <TableRow key={reminder._id}>
                  <TableCell>{reminder.license_plate}</TableCell>
                  <TableCell>{reminder.title}</TableCell>
                  <TableCell>
                    {new Date(reminder.due_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        reminder.status === "completed"
                          ? "default"
                          : reminder.status === "overdue"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {reminder.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {reminder.notes || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <PaginationControls
          currentPage={filters.page}
          totalPages={Math.ceil(totalCount / PAGE_SIZE)}
          onPageChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
        />
      </div>
    </div>
  );
}
