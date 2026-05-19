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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Reminder as ServiceReminder, Vehicle, MaintenanceCategory, MAINTENANCE_ITEMS, getPriorityFromItem } from "@/types";
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

const CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string }[] = [
  { value: "braking_system", label: "Braking System" },
  { value: "fuel_system", label: "Fuel System" },
  { value: "spring_suspension", label: "Spring & Suspension" },
  { value: "auto_electricals", label: "Auto Electricals" },
  { value: "engine_gearbox", label: "Engine & Gearbox" },
  { value: "cab_body", label: "Cab / Body" },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical - Immediate attention" },
  { value: "high", label: "High - Address soon" },
  { value: "medium", label: "Medium - Schedule maintenance" },
  { value: "low", label: "Low - Monitor only" },
];

export default function ServiceForm({
  vehicle,
  onSuccess,
  editService,
}: ServiceFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MaintenanceCategory>("braking_system");
  const [selectedItem, setSelectedItem] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [useCustomItem, setUseCustomItem] = useState(false);
  
  const [formData, setFormData] = useState<Partial<ServiceReminder>>({
    title: "",
    due_date: new Date().toISOString().split("T")[0],
    status: "pending",
    notes: "",
    recurrence_interval: undefined,
    license_plate: vehicle.license_plate,
  });

  // Available items based on selected category
  const availableItems = MAINTENANCE_ITEMS[selectedCategory] || [];

  // Update priority when item changes
  useEffect(() => {
    if (selectedItem && !useCustomItem) {
      const priority = getPriorityFromItem(selectedItem);
      setFormData(prev => ({ ...prev, priority }));
    }
  }, [selectedItem, useCustomItem]);

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
      // Set category and item if they exist in the edit data
      if ((editService as any).category) {
        setSelectedCategory((editService as any).category);
      }
      const existingTitle = editService.title || "";
      // Check if title matches any predefined item
      const matchingItem = Object.values(MAINTENANCE_ITEMS).flat().find(
        item => item.toLowerCase() === existingTitle.toLowerCase()
      );
      if (matchingItem) {
        setSelectedItem(matchingItem);
        setUseCustomItem(false);
      } else {
        setCustomItem(existingTitle);
        setUseCustomItem(true);
      }
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
      setSelectedCategory("braking_system");
      setSelectedItem("");
      setCustomItem("");
      setUseCustomItem(false);
    }
  }, [open, vehicle.license_plate]);

  // Update title when selected item changes
  useEffect(() => {
    if (!useCustomItem && selectedItem) {
      setFormData(prev => ({ ...prev, title: selectedItem }));
    } else if (useCustomItem) {
      setFormData(prev => ({ ...prev, title: customItem }));
    }
  }, [selectedItem, useCustomItem, customItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title) {
      toast.error("Please select or enter a service item");
      return;
    }
    
    setLoading(true);

    try {
      const isEdit = Boolean(editService?._id);

      const payload = {
        ...formData,
        due_date: new Date(formData.due_date!).toISOString(),
        recurrence_interval: formData.recurrence_interval === "none" ? undefined : formData.recurrence_interval,
        category: selectedCategory,
        priority: formData.priority || getPriorityFromItem(formData.title),
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
        <Button onClick={() => setOpen(true)}>+ Add Service Reminder</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editService ? "Edit Service Reminder" : "New Service Reminder"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>License Plate</Label>
              <Input value={vehicle.license_plate} readOnly className="bg-muted" />
            </div>

            {/* Service Category */}
            <div>
              <Label>Service Category *</Label>
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value as MaintenanceCategory);
                  setSelectedItem("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Service Item Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Service Item *</Label>
                <button
                  type="button"
                  onClick={() => setUseCustomItem(!useCustomItem)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {useCustomItem ? "Use predefined item" : "Enter custom item"}
                </button>
              </div>
              
              {!useCustomItem ? (
                <Select value={selectedItem} onValueChange={setSelectedItem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service item" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {availableItems.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={customItem}
                  onChange={(e) => setCustomItem(e.target.value)}
                  placeholder="Enter custom service description"
                />
              )}
            </div>

            {/* Priority (auto-set from item, but can override) */}
            <div>
              <Label>Priority</Label>
              <Select
                value={formData.priority as string || "medium"}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!useCustomItem && selectedItem && (
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-set based on safety criticality
                </p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                required
              />
            </div>

            {/* Status */}
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

            {/* Recurrence */}
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
            </div>

            {/* Notes */}
            <div>
              <Label>Notes / Technician Notes</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes, parts required, estimated cost..."
                rows={3}
              />
            </div>

            {/* Estimated Cost Field */}
            <div>
              <Label>Estimated Cost (Optional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Estimated repair cost"
                value={(formData as any).estimated_cost || ""}
                onChange={(e) =>
                  setFormData({ ...formData, estimated_cost: parseFloat(e.target.value) || undefined })
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
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