/* eslint-disable @typescript-eslint/no-explicit-any */
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
    status: "due",
    notes: "",
    license_plate: vehicle.license_plate,
  });

  useEffect(() => {
    if (editService) {
      // Properly format the date for the input field
      const dueDate = editService.due_date
        ? new Date(editService.due_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      setFormData({
        ...editService,
        due_date: dueDate,
        license_plate: vehicle.license_plate,
      });
      setOpen(true);
    }
  }, [editService, vehicle.license_plate]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Reset form data when dialog closes
      setFormData({
        title: "",
        due_date: new Date().toISOString().split("T")[0],
        status: "due",
        notes: "",
        license_plate: vehicle.license_plate,
      });
    }
  }, [open, vehicle.license_plate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editService
        ? `/api/reminders?id=${editService._id}`
        : "/api/reminders";
      const method = editService ? "PUT" : "POST";

      const payload = {
        ...formData,
        due_date: new Date(formData.due_date!).toISOString(),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save reminder");
      }

      toast.success(
        `Service reminder ${editService ? "updated" : "created"} successfully`
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
                  setFormData({ ...formData, status: value as any })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
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
