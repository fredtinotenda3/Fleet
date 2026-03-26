"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Reminder as ServiceReminder, Vehicle } from "@/types";
import { toast } from "sonner";

interface ServiceFormProps {
  vehicle: Vehicle;
  onSuccess: () => void;
  editService?: ServiceReminder;
}

const RECURRENCE_OPTIONS = [
  { value: "none", label: "No recurrence" },
  { value: "7d", label: "Every week" },
  { value: "14d", label: "Every 2 weeks" },
  { value: "30d", label: "Every month" },
  { value: "90d", label: "Every 3 months" },
  { value: "180d", label: "Every 6 months" },
  { value: "1y", label: "Every year" },
];

export default function ServiceForm({
  vehicle,
  onSuccess,
  editService,
}: ServiceFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<ServiceReminder>>({
    title: "",
    due_date: new Date().toISOString().split("T")[0],
    status: "pending",
    notes: "",
    recurrence_interval: undefined,
    license_plate: vehicle.license_plate,
  });

  useEffect(() => {
    if (editService) {
      setFormData({
        ...editService,
        due_date: editService.due_date
          ? new Date(editService.due_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        recurrence_interval: editService.recurrence_interval || undefined,
        license_plate: vehicle.license_plate,
      });
      setOpen(true);
    }
  }, [editService, vehicle.license_plate]);

  useEffect(() => {
    if (!open) {
      setFormData({
        title: "",
        due_date: new Date().toISOString().split("T")[0],
        status: "pending",
        notes: "",
        recurrence_interval: undefined,
        license_plate: vehicle.license_plate,
      });
    }
  }, [open, vehicle.license_plate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isEdit = Boolean(editService?._id);

      const payload = {
        ...formData,
        due_date: new Date(formData.due_date!).toISOString(),
        // Convert "none" to undefined for the API
        recurrence_interval: formData.recurrence_interval === "none" ? undefined : formData.recurrence_interval,
        ...(isEdit && { _id: editService!._id }),
      };

      const res = await fetch("/api/reminders", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save reminder");
      }

      toast.success(
        `Service reminder ${isEdit ? "updated" : "created"} successfully`
      );

      setOpen(false);
      onSuccess();
    } catch (error) {
      toast.error("Error saving service reminder", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!editService && (
        <Button onClick={() => setOpen(true)}>Add Service Reminder</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editService ? "Edit Service Reminder" : "New Service Reminder"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>License Plate</Label>
              <Input value={vehicle.license_plate} readOnly />
            </div>

            <div>
              <Label>Service Title</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g. Oil change, Tyre rotation"
                required
              />
            </div>

            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                required
              />
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as ServiceReminder["status"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* #14 — Recurrence interval */}
            <div>
              <Label>Recurrence</Label>
              <Select
                value={formData.recurrence_interval || "none"}
                onValueChange={(value) =>
                  setFormData({ ...formData, recurrence_interval: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No recurrence" />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.recurrence_interval && formData.recurrence_interval !== "none" && (
                <p className="text-xs text-muted-foreground mt-1">
                  When marked complete, the next reminder will be created automatically.
                </p>
              )}
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Optional notes"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Reminder"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}