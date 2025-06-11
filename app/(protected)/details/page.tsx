/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Vehicle, PaginatedResponse } from "@/types";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Download, Printer, Sliders, Car } from "lucide-react";
// @ts-ignore
import { CSVLink } from "react-csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "use-debounce";

const PAGE_SIZE = 50;
const CARD_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-gray-100 text-gray-800",
  "bg-yellow-100 text-yellow-800",
];

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  maintenance: "bg-yellow-100 text-yellow-800",
} as const;

const getStatusColor = (status?: string) =>
  STATUS_COLORS[
    (status || "unknown").toLowerCase() as keyof typeof STATUS_COLORS
  ] || "bg-gray-100 text-gray-800";

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

export default function AllVehiclesDetailsPage() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse<Vehicle>>({
    data: [],
    pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch] = useDebounce(searchTerm, 500);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    maintenance: 0,
  });

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: data.pagination.page.toString(),
        limit: data.pagination.limit.toString(),
      });

      if (debouncedSearch) {
        params.set("license_plate", debouncedSearch);
      }
      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }

      const res = await fetch(`/api/vehicles?${params}`);
      if (!res.ok) throw new Error("Failed to fetch vehicles");

      const response: PaginatedResponse<Vehicle> = await res.json();
      setData(response);
    } catch (error) {
      toast.error("Error loading vehicles");
    } finally {
      setLoading(false);
    }
  }, [
    data.pagination.page,
    data.pagination.limit,
    debouncedSearch,
    selectedStatus,
  ]);

  // FIX: Use main vehicles endpoint to ensure non-deleted vehicles are counted
  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        license_plate: debouncedSearch,
        ...(selectedStatus !== "all" && { status: selectedStatus }),
        limit: "10000", // Get all vehicles in single request
        page: "1",
      });

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch vehicle stats");
      const response: PaginatedResponse<Vehicle> = await res.json();

      // Calculate stats from all vehicles (non-deleted)
      const active = response.data.filter((v) => v.status === "active").length;
      const inactive = response.data.filter(
        (v) => v.status === "inactive"
      ).length;
      const maintenance = response.data.filter(
        (v) => v.status === "maintenance"
      ).length;

      setStats({
        total: response.pagination.total,
        active,
        inactive,
        maintenance,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Error loading vehicle stats");
    }
  }, [debouncedSearch, selectedStatus]);

  useEffect(() => {
    const abortController = new AbortController();
    fetchVehicles();
    fetchStats();
    return () => abortController.abort();
  }, [fetchVehicles, fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [debouncedSearch, selectedStatus, fetchStats]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > data.pagination.totalPages || loading) return;
    setData((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, page: newPage },
    }));
  };

  useEffect(() => {
    setData((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, page: 1 },
    }));
  }, [selectedStatus, debouncedSearch]);

  const exportData = useMemo(() => {
    const headers = [
      { label: "License Plate", key: "license_plate" },
      { label: "Make", key: "make" },
      { label: "Model", key: "model" },
      { label: "Year", key: "year" },
      { label: "Color", key: "color" },
      { label: "Fuel Type", key: "fuel_type" },
      { label: "Purchase Date", key: "purchase_date" },
      { label: "Status", key: "status" },
    ];

    return {
      data: data.data.map((vehicle) => ({
        ...vehicle,
        purchase_date: vehicle.purchase_date
          ? new Intl.DateTimeFormat().format(new Date(vehicle.purchase_date))
          : "N/A",
      })),
      headers,
    };
  }, [data]);

  const printSummary = () => {
    const printWindow = window.open("", "_blank");

    printWindow?.document.write(`
      <html>
        <head>
          <title>Vehicle Report Summary</title>
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
          <h1>Vehicle Report Summary</h1>
          
          <div class="stats">
            <div class="stat-card">
              <h3>Total Vehicles</h3>
              <p>${stats.total}</p>
            </div>
            <div class="stat-card">
              <h3>Active Vehicles</h3>
              <p>${stats.active}</p>
            </div>
            <div class="stat-card">
              <h3>Inactive Vehicles</h3>
              <p>${stats.inactive}</p>
            </div>
            <div class="stat-card">
              <h3>In Maintenance</h3>
              <p>${stats.maintenance}</p>
            </div>
          </div>
          
          <h2>Vehicle List</h2>
          <table>
            <thead>
              <tr>
                <th>License Plate</th>
                <th>Make</th>
                <th>Model</th>
                <th>Year</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${data.data
                .map(
                  (vehicle) => `
                <tr>
                  <td>${vehicle.license_plate}</td>
                  <td>${vehicle.make ?? "N/A"}</td>
                  <td>${vehicle.model ?? "N/A"}</td>
                  <td>${vehicle.year?.toString() ?? "N/A"}</td>
                  <td>${vehicle.status || "unknown"}</td>
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
          <Car className="h-6 w-6 text-blue-600" />
          Vehicle Details
        </h1>
        <div className="w-full md:w-auto flex gap-2">
          <Input
            placeholder="Search vehicles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
          <div className="flex gap-2">
            <CSVLink {...exportData} filename="vehicles-report.csv">
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
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">
                Vehicle Status
              </label>
              <Select
                value={selectedStatus}
                onValueChange={(value) => setSelectedStatus(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.keys(STATUS_COLORS).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Car className="h-6 w-6" />}
          title="Total Vehicles"
          value={stats.total.toLocaleString()}
          color={CARD_COLORS[0]}
        />
        <StatCard
          icon={<Car className="h-6 w-6" />}
          title="Active Vehicles"
          value={stats.active.toLocaleString()}
          color={CARD_COLORS[1]}
          description="Currently in operation"
        />
        <StatCard
          icon={<Car className="h-6 w-6" />}
          title="Inactive Vehicles"
          value={stats.inactive.toLocaleString()}
          color={CARD_COLORS[2]}
          description="Not in operation"
        />
        <StatCard
          icon={<Car className="h-6 w-6" />}
          title="In Maintenance"
          value={stats.maintenance.toLocaleString()}
          color={CARD_COLORS[3]}
          description="Undergoing service"
        />
      </div>

      <div className="hidden md:flex flex-wrap gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">
            Vehicle Status
          </label>
          <Select
            value={selectedStatus}
            onValueChange={(value) => setSelectedStatus(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.keys(STATUS_COLORS).map((status) => (
                <SelectItem key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>License Plate</TableHead>
              <TableHead>Make</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Fuel Type</TableHead>
              <TableHead>Purchase Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : data.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-muted-foreground"
                >
                  <Car className="mx-auto mb-2 h-6 w-6" />
                  No vehicles found. Try adjusting the filters.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((vehicle) => (
                <TableRow
                  key={vehicle._id ?? vehicle.license_plate}
                  onClick={() =>
                    router.push(
                      `/vehicles?selectedVehicle=${vehicle.license_plate}`
                    )
                  }
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <div
                      title={vehicle.color || "Default color"}
                      className="h-6 w-6 rounded-full border shadow-sm"
                      style={{ backgroundColor: vehicle.color || "#cccccc" }}
                    />
                  </TableCell>
                  <TableCell className="font-mono">
                    <Badge variant="outline">{vehicle.license_plate}</Badge>
                  </TableCell>
                  <TableCell>{vehicle.make ?? "N/A"}</TableCell>
                  <TableCell>{vehicle.model ?? "N/A"}</TableCell>
                  <TableCell>{vehicle.year?.toString() ?? "N/A"}</TableCell>
                  <TableCell>{vehicle.fuel_type ?? "N/A"}</TableCell>
                  <TableCell>
                    {vehicle.purchase_date
                      ? new Intl.DateTimeFormat().format(
                          new Date(vehicle.purchase_date)
                        )
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(vehicle.status)}>
                      {vehicle.status?.toLowerCase() || "unknown"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data.pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <Button
            variant="outline"
            disabled={data.pagination.page === 1 || loading}
            onClick={() => handlePageChange(data.pagination.page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={
              data.pagination.page === data.pagination.totalPages || loading
            }
            onClick={() => handlePageChange(data.pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
