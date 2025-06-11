"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Vehicle {
  _id?: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  status?: "active" | "inactive" | "maintenance"; // Added status field
}

interface VehicleFormProps {
  closeModal: () => void;
  refresh: () => void;
  vehicle?: Vehicle | null;
}

// Status options for dropdown
const statusOptions = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "maintenance", label: "Maintenance" },
];

const VehicleForm = ({ closeModal, refresh, vehicle }: VehicleFormProps) => {
  const [formData, setFormData] = useState<Vehicle>({
    license_plate: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vehicle_type: "",
    purchase_date: "",
    fuel_type: "",
    status: "active", // Default status
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setFormData({
        ...vehicle,
        status: vehicle.status || "active", // Ensure status exists
      });
    }
  }, [vehicle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "year" ? Number(value) : value,
    }));
  };

  const handleStatusChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      status: value as Vehicle["status"], // Cast to correct type
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const method = vehicle?._id ? "PUT" : "POST";
      const endpoint = "/api/vehicles";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          vehicle?._id ? { ...formData, id: vehicle._id } : formData
        ),
      });

      if (!res.ok) throw new Error("Failed to save vehicle");

      toast.success(
        `Vehicle ${vehicle?._id ? "updated" : "added"} successfully`
      );
      refresh();
      closeModal();
    } catch (error) {
      toast.error("Failed to save vehicle", {
        description:
          error instanceof Error ? error.message : "Unexpected error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div>
        <Label htmlFor="license_plate">License Plate</Label>
        <Input
          id="license_plate"
          name="license_plate"
          value={formData.license_plate}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="make">Make</Label>
        <Input
          id="make"
          name="make"
          value={formData.make}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          name="model"
          value={formData.model}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="year">Year</Label>
        <Input
          id="year"
          name="year"
          type="number"
          value={formData.year}
          onChange={handleChange}
          required
          min={1900}
          max={new Date().getFullYear() + 1}
        />
      </div>

      <div>
        <Label htmlFor="vehicle_type">Vehicle Type</Label>
        <Input
          id="vehicle_type"
          name="vehicle_type"
          value={formData.vehicle_type}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="purchase_date">Purchase Date</Label>
        <Input
          id="purchase_date"
          name="purchase_date"
          type="date"
          value={formData.purchase_date}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="fuel_type">Fuel Type</Label>
        <Input
          id="fuel_type"
          name="fuel_type"
          value={formData.fuel_type}
          onChange={handleChange}
          required
        />
      </div>

      {/* Added Status Dropdown */}
      <div>
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={handleStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between items-center pt-2 gap-2">
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : vehicle ? "Update" : "Add"}
          </Button>
          <Button type="button" variant="outline" onClick={closeModal}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
};

export default VehicleForm;
