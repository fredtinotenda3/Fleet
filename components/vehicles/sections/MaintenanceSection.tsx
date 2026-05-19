/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ServiceForm from "../forms/ServiceForm";
import { Reminder, Vehicle, MaintenanceCategory, MAINTENANCE_ITEMS, getPriorityFromItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Info, Loader, Wrench, Fuel, Gauge, Battery, Settings, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type MaintenanceSectionProps = {
  vehicle: Vehicle;
};

// Category icons mapping
const categoryIcons: Record<MaintenanceCategory, React.ReactNode> = {
  braking_system: <Gauge className="h-4 w-4" />,
  fuel_system: <Fuel className="h-4 w-4" />,
  spring_suspension: <Settings className="h-4 w-4" />,
  auto_electricals: <Battery className="h-4 w-4" />,
  engine_gearbox: <Settings className="h-4 w-4" />,
  cab_body: <Car className="h-4 w-4" />,
};

// Category display names
const categoryNames: Record<MaintenanceCategory, string> = {
  braking_system: "Braking System",
  fuel_system: "Fuel System",
  spring_suspension: "Spring & Suspension",
  auto_electricals: "Auto Electricals",
  engine_gearbox: "Engine & Gearbox",
  cab_body: "Cab / Body",
};

// Priority colors
const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function MaintenanceSection({
  vehicle,
}: MaintenanceSectionProps) {
  const [services, setServices] = useState<Reminder[]>([]);
  const [selectedService, setSelectedService] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reminders?license_plate=${encodeURIComponent(
          vehicle.license_plate
        )}&cache=${Date.now()}`
      );
      if (!res.ok) throw new Error("Failed to fetch service reminders");
      const data = await res.json();
      setServices(data);
    } catch (error) {
      console.error("Error fetching service reminders:", error);
      toast.error("Failed to load maintenance records");
    } finally {
      setLoading(false);
    }
  }, [vehicle.license_plate]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleDelete = (id: string) => {
    setDeletingId(id);
    toast("Are you sure you want to delete this service reminder?", {
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            const res = await fetch(`/api/reminders`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });

            if (!res.ok) throw new Error("Delete failed");
            toast.success("Reminder deleted successfully");
            fetchServices();
          } catch (err) {
            console.error(err);
            toast.error("Failed to delete reminder");
          } finally {
            setDeletingId(null);
          }
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => setDeletingId(null),
      },
    });
  };

  const handleStatusUpdate = async (serviceId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _id: serviceId,
          status: newStatus,
          ...(newStatus === "completed" && { completion_date: new Date().toISOString() }),
        }),
      });
      
      if (!res.ok) throw new Error("Failed to update status");
      toast.success(`Service marked as ${newStatus}`);
      fetchServices();
    } catch (error) {
      toast.error("Failed to update service status");
    }
  };

  const renderStatusBadge = (status: Reminder["status"]) => {
    const colorVariant = {
      due: "destructive",
      completed: "default",
      pending: "secondary",
      overdue: "destructive",
    }[status];

    const tooltipText = {
      due: "Service is due soon",
      completed: "Service completed",
      pending: "Service not yet due",
      overdue: "Service is overdue",
    }[status];

    const icon = {
      due: <Info size={14} className="text-red-500" />,
      completed: <Info size={14} className="text-green-500" />,
      pending: <Info size={14} className="text-yellow-500" />,
      overdue: <Info size={14} className="text-red-600" />,
    }[status];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={colorVariant as any}
              className="flex items-center gap-1 cursor-pointer"
              onClick={() => {
                if (status !== "completed") {
                  handleStatusUpdate(service._id!, "completed");
                }
              }}
            >
              {icon}
              {status}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const handleSuccess = useCallback(() => {
    fetchServices();
    setSelectedService(null);
  }, [fetchServices]);

  // Filter services
  const filteredServices = services.filter(service => {
    if (filterCategory !== "all" && (service as any).category !== filterCategory) return false;
    if (filterPriority !== "all" && (service as any).priority !== filterPriority) return false;
    return true;
  });

  // Calculate stats
  const stats = {
    total: services.length,
    pending: services.filter(s => s.status === "pending").length,
    overdue: services.filter(s => s.status === "overdue").length,
    completed: services.filter(s => s.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-600" />
            Maintenance & Service Schedule
          </h3>
          <p className="text-sm text-muted-foreground">
            Track brake services, fuel system checks, electrical repairs, and more
          </p>
        </div>
        <ServiceForm
          vehicle={vehicle}
          onSuccess={handleSuccess}
          editService={selectedService || undefined}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Services</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-45">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="braking_system">Braking System</SelectItem>
            <SelectItem value="fuel_system">Fuel System</SelectItem>
            <SelectItem value="spring_suspension">Spring & Suspension</SelectItem>
            <SelectItem value="auto_electricals">Auto Electricals</SelectItem>
            <SelectItem value="engine_gearbox">Engine & Gearbox</SelectItem>
            <SelectItem value="cab_body">Cab / Body</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-35">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Services Table */}
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Service Item</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  <div className="flex justify-center py-4">
                    <Loader className="animate-spin h-6 w-6" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredServices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No maintenance records found.
                  <br />
                  <span className="text-xs">Click &quot;Add Service Reminder&quot; to schedule maintenance</span>
                </TableCell>
              </TableRow>
            ) : (
              filteredServices.map((service) => (
                <TableRow key={service._id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {categoryIcons[(service as any).category as MaintenanceCategory]}
                      <span className="text-sm">
                        {categoryNames[(service as any).category as MaintenanceCategory] || "General"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {service.title}
                  </TableCell>
                  <TableCell>
                    {new Date(service.due_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={priorityColors[(service as any).priority] || priorityColors.medium}>
                      {(service as any).priority || "medium"}
                    </Badge>
                  </TableCell>
                  <TableCell>{renderStatusBadge(service.status)}</TableCell>
                  <TableCell className="max-w-50 truncate">
                    {service.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setSelectedService(service)}
                      disabled={deletingId === service._id}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(service._id!)}
                      disabled={deletingId === service._id}
                    >
                      {deletingId === service._id ? (
                        <Loader className="animate-spin h-4 w-4" />
                      ) : (
                        <Trash2 size={16} className="text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}