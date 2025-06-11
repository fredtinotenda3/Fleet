/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Expense, ExpenseType } from "@/types";
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
import { ExpenseCharts } from "@/components/vehicles/sections/expenses/ExpenseCharts";
import { Badge } from "@/components/ui/badge";
import {
  CoinsIcon,
  CalendarIcon,
  GaugeIcon,
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

interface ApiExpense extends Omit<Expense, "date"> {
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

export default function AllExpensesPage() {
  const router = useRouter();
  const [data, setData] = useState<Expense[]>([]);
  const [chartData, setChartData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [expenseTypes, setExpenseTypes] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const parseExpenses = useCallback((apiData: ApiExpense[]): Expense[] => {
    return apiData.map((expense) => ({
      ...expense,
      date: new Date(expense.date),
    }));
  }, []);

  const fetchExpenses = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: PAGE_SIZE.toString(),
          search: searchTerm,
          ...(selectedType !== "all" && { type: selectedType }),
          ...(startDate && { start: startDate.toISOString() }),
          ...(endDate && { end: endDate.toISOString() }),
          includeNonDeletedVehicles: "true", // Added filter for non-deleted vehicles
        });

        const res = await fetch(`/api/expenses?${params}`);
        if (!res.ok) throw new Error("Failed to fetch expenses");

        const response: ApiExpense[] = await res.json();
        const parsedData = parseExpenses(response);
        setData(parsedData);

        const totalCount = res.headers.get("X-Total-Count");
        setTotalPages(
          totalCount ? Math.ceil(Number(totalCount) / PAGE_SIZE) : 1
        );
      } catch (error) {
        toast.error("Error loading expenses");
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [searchTerm, selectedType, startDate, endDate, parseExpenses]
  );

  const fetchChartData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        ...(selectedType !== "all" && { type: selectedType }),
        ...(startDate && { start: startDate.toISOString() }),
        ...(endDate && { end: endDate.toISOString() }),
        includeNonDeletedVehicles: "true", // Added filter for non-deleted vehicles
      });

      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      const response: ApiExpense[] = await res.json();
      const parsedData = parseExpenses(response);
      setChartData(parsedData);
    } catch (error) {
      toast.error("Error loading chart data");
      setChartData([]);
    }
  }, [searchTerm, selectedType, startDate, endDate, parseExpenses]);

  // Add visibility change handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchExpenses(currentPage);
        fetchChartData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchExpenses, fetchChartData, currentPage]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setCurrentPage(1);
      fetchExpenses(1);
      fetchChartData();
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [
    fetchExpenses,
    fetchChartData,
    searchTerm,
    selectedType,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    fetchExpenses(currentPage);
  }, [currentPage, fetchExpenses]);

  const fetchExpenseTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/expense-types");
      const types: ExpenseType[] = await res.json();
      setExpenseTypes(types?.map((t) => t.name) || []);
    } catch (error) {
      console.error("Failed to fetch expense types:", error);
      setExpenseTypes([]);
    }
  }, []);

  useEffect(() => {
    fetchExpenseTypes();
  }, [fetchExpenseTypes]);

  const aggregatedData = useMemo(() => {
    const typeData = chartData.reduce(
      (acc: Record<string, number>, expense) => {
        const type = expense.expense_type?.name || "Other";
        acc[type] = (acc[type] || 0) + (expense.amount || 0);
        return acc;
      },
      {}
    );

    const timeData = chartData.reduce(
      (acc: Record<string, number>, expense) => {
        const date = expense.date instanceof Date ? expense.date : new Date();
        const dateKey = format(date, "yyyy-MM-dd");
        acc[dateKey] = (acc[dateKey] || 0) + (expense.amount || 0);
        return acc;
      },
      {}
    );

    return { typeData, timeData };
  }, [chartData]);

  const stats = useMemo(() => {
    const total = Object.values(aggregatedData.typeData).reduce(
      (a, b) => a + b,
      0
    );

    const allDates = chartData
      .map((e) => e.date)
      .filter((d) => d instanceof Date && !isNaN(d.getTime()));

    const uniqueDates = Array.from(
      new Set(allDates.map((d) => d.getTime()))
    ).map((t) => new Date(t));

    const dailyAvg = uniqueDates.length > 0 ? total / uniqueDates.length : 0;

    const defaultDate = new Date();

    const start =
      startDate ||
      (allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : defaultDate);

    const end =
      endDate ||
      (allDates.length > 0
        ? new Date(Math.max(...allDates.map((d) => d.getTime())))
        : defaultDate);

    const monthDiff = Math.max(
      (end.getFullYear() - start.getFullYear()) * 12 +
        end.getMonth() -
        start.getMonth() +
        1,
      1
    );

    return {
      total,
      dailyAvg,
      monthlyAvg: total / monthDiff,
      startDate: start,
      endDate: end,
      monthDiff,
    };
  }, [aggregatedData, chartData, startDate, endDate]);

  const { typeData, timeData, monthlyTrends, topCategories } = useMemo(() => {
    const typeData = chartData.reduce(
      (acc: Record<string, number>, expense) => {
        const type = expense.expense_type?.name || "Other";
        acc[type] = (acc[type] || 0) + (expense.amount || 0);
        return acc;
      },
      {}
    );

    const timeData = chartData.reduce(
      (acc: Record<string, number>, expense) => {
        const date = expense.date instanceof Date ? expense.date : new Date();
        const dateKey = format(date, "yyyy-MM-dd");
        acc[dateKey] = (acc[dateKey] || 0) + (expense.amount || 0);
        return acc;
      },
      {}
    );

    const monthlyTrends = chartData.reduce(
      (acc: Record<string, number>, expense) => {
        const monthKey = format(expense.date, "yyyy-MM");
        acc[monthKey] = (acc[monthKey] || 0) + (expense.amount || 0);
        return acc;
      },
      {}
    );

    const sortedCategories = Object.entries(typeData)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc: Record<string, number>, [key, val]) => {
        acc[key] = val;
        return acc;
      }, {});

    return {
      typeData,
      timeData,
      monthlyTrends: Object.entries(monthlyTrends).map(([date, amount]) => ({
        date: format(parseISO(`${date}-01`), "MMM yyyy"),
        amount,
      })),
      topCategories: Object.entries(sortedCategories),
    };
  }, [chartData]);

  const exportData = useMemo(() => {
    const headers = [
      { label: "Date", key: "date" },
      { label: "Type", key: "expense_type.name" },
      { label: "Amount", key: "amount" },
      { label: "Description", key: "description" },
      { label: "Vehicle", key: "license_plate" },
    ];

    return {
      data: data.map((expense) => ({
        ...expense,
        date: format(expense.date, "yyyy-MM-dd"),
        amount: `$${expense.amount?.toFixed(2)}`,
      })),
      headers,
    };
  }, [data]);

  const printSummary = () => {
    const printWindow = window.open("", "_blank");
    const chartCanvas = document.querySelector(
      "#monthly-trends-chart"
    ) as HTMLCanvasElement | null;

    printWindow?.document.write(`
    <html>
      <head>
        <title>Expense Report Summary</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h1 { color: #1a365d; }
          .stats { display: grid; gap: 20px; margin-bottom: 30px; }
          .chart { margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>Expense Report Summary</h1>
        <div class="stats">
          ${Object.entries(stats)
            .map(
              ([key, value]) => `
            <div>
              <h3>${key}</h3>
              <p>${value}</p>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="chart">
          <h2>Monthly Trends</h2>
          <img src="${chartCanvas?.toDataURL() || ""}" width="800" />
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
          <CoinsIcon className="h-6 w-6 text-green-600" />
          All Expenses Analytics
        </h1>
        <div className="w-full md:w-auto flex gap-2">
          <Input
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
          <div className="flex gap-2">
            <CSVLink {...exportData} filename="expenses-report.csv">
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
              <label className="text-sm font-medium mb-1 block">
                Expense Type
              </label>
              <Select
                value={selectedType}
                onValueChange={(value) => setSelectedType(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {expenseTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
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
          icon={<CoinsIcon className="h-6 w-6" />}
          title="Total Expenses"
          value={`$${stats.total.toLocaleString()}`}
          color={CARD_COLORS[0]}
          description={
            stats.startDate &&
            stats.endDate &&
            `${format(stats.startDate, "MMM yyyy")} - ${format(
              stats.endDate,
              "MMM yyyy"
            )}`
          }
        />
        <StatCard
          icon={<CalendarIcon className="h-6 w-6" />}
          title="Daily Average"
          value={`$${stats.dailyAvg.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}`}
          color={CARD_COLORS[1]}
          description={
            stats.startDate &&
            `Based on ${format(stats.startDate, "MMM dd, yyyy")} - ${format(
              stats.endDate,
              "MMM dd, yyyy"
            )}`
          }
        />
        <StatCard
          icon={<GaugeIcon className="h-6 w-6" />}
          title="Monthly Average"
          value={`$${stats.monthlyAvg.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}`}
          color={CARD_COLORS[2]}
          description={`Over ${Math.round(stats.monthDiff)} months`}
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
          <label className="text-sm font-medium mb-1 block">Expense Type</label>
          <Select
            value={selectedType}
            onValueChange={(value) => setSelectedType(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {expenseTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ExpenseCharts
        timeData={Object.entries(timeData).map(([date, amount]) => ({
          date: format(new Date(date), "MMM dd"),
          amount,
        }))}
        typeData={Object.entries(typeData).map(([name, value]) => ({
          name,
          value,
        }))}
        monthlyTrends={monthlyTrends}
        topCategories={topCategories.map(([name, value]) => ({
          name,
          value,
        }))}
        colors={["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6"]}
        onCategorySelect={(category) => setSelectedType(category)}
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Description</TableHead>
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
                    <Skeleton className="h-4 w-[120px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[200px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-4 text-muted-foreground"
                >
                  <CoinsIcon className="mx-auto h-8 w-8 mb-2" />
                  No expenses found matching your criteria
                </TableCell>
              </TableRow>
            ) : (
              data.map((expense) => (
                <TableRow
                  key={expense._id}
                  onClick={() =>
                    router.push(
                      `/vehicles?selectedVehicle=${expense.license_plate}`
                    )
                  }
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {expense.license_plate}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(expense.date, "MMM dd, yyyy")}</TableCell>
                  <TableCell>
                    <Badge className="bg-blue-100 text-blue-800">
                      {expense.expense_type?.name || "Other"}
                    </Badge>
                  </TableCell>
                  <TableCell>${(expense.amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {expense.description || "-"}
                  </TableCell>
                </TableRow>
              ))
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
