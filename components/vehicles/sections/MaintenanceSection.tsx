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
import { Reminder, Vehicle } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Info, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function MaintenanceSection({
  vehicle,
}: MaintenanceSectionProps) {
  const [services, setServices] = useState<Reminder[]>([]);
  const [selectedService, setSelectedService] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reminders?license_plate=${encodeURIComponent(
          vehicle.license_plate
        )}&cache=${Date.now()}` // Cache busting
      );
      if (!res.ok) throw new Error("Failed to fetch service reminders");
      const data = await res.json();
      setServices(data);
    } catch (error) {
      console.error("Error fetching service reminders:", error);
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
              className="flex items-center gap-1"
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
    setSelectedService(null); // Clear selection after success
  }, [fetchServices]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Service Schedule</h3>
        <ServiceForm
          vehicle={vehicle}
          onSuccess={handleSuccess}
          editService={selectedService || undefined}
        />
      </div>

      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>License Plate</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  <div className="flex justify-center py-4">
                    <Loader className="animate-spin h-6 w-6" />
                  </div>
                </TableCell>
              </TableRow>
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  No service reminders found.
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service._id}>
                  <TableCell>{service.license_plate}</TableCell>
                  <TableCell>{service.title}</TableCell>
                  <TableCell>
                    {new Date(service.due_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{renderStatusBadge(service.status)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
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
