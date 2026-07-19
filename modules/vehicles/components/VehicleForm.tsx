"use client";

import { useEffect, useState } from "react";
import { Input } from "@/frontend/shared/ui/forms/input";
import { Button } from "@/frontend/shared/ui/primitives/button";
import { Label } from "@/frontend/shared/ui/forms/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/shared/ui/forms/select";
import { Car, Calendar, Fuel, Palette, Hash, Gauge } from "lucide-react";

interface VehicleFormData {
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color: string;
  status: 'active' | 'inactive' | 'maintenance';
}

interface VehicleFormProps {
  closeModal: () => void;
  refresh: () => void;
  onSuccess?: () => void;
  vehicle?: {
    _id?: string;
    license_plate: string;
    make: string;
    model: string;
    year: number;
    vehicle_type: string;
    purchase_date: string;
    fuel_type: string;
    color?: string;
    status?: 'active' | 'inactive' | 'maintenance';
  } | null;
}

const statusOptions = [
  { value: 'active', label: 'Active', color: 'bg-green-500' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-500' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-yellow-500' },
];

const fuelTypes = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'LPG', 'CNG', 'Hydrogen'];
const vehicleTypes = ['Car', 'Truck', 'Van', 'Bus', 'Motorcycle', 'Tractor', 'Trailer', 'SUV', 'Sedan', 'Hatchback'];

const EMPTY_FORM: VehicleFormData = {
  license_plate: '',
  make: '',
  model: '',
  year: new Date().getFullYear(),
  vehicle_type: 'Car',
  purchase_date: '',
  fuel_type: 'Petrol',
  color: '#3b82f6',
  status: 'active',
};

export default function VehicleForm({ closeModal, refresh, onSuccess, vehicle }: VehicleFormProps) {
  const [formData, setFormData] = useState<VehicleFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vehicle) {
      setFormData({
        license_plate: vehicle.license_plate || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        vehicle_type: vehicle.vehicle_type || 'Car',
        purchase_date: vehicle.purchase_date || '',
        fuel_type: vehicle.fuel_type || 'Petrol',
        color: vehicle.color || '#3b82f6',
        status: vehicle.status || 'active',
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
  }, [vehicle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'year' ? (parseInt(value) || new Date().getFullYear()) : value,
    }));
    if (errors[name]) {
      setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const payload = {
      license_plate: formData.license_plate.replace(/\s/g, '').toUpperCase(),
      make: formData.make.trim(),
      model: formData.model.trim(),
      year: formData.year,
      vehicle_type: formData.vehicle_type,
      purchase_date: formData.purchase_date,
      fuel_type: formData.fuel_type,
      color: formData.color || '#3b82f6',
      status: formData.status,
    };

    try {
      const isEdit = !!vehicle?._id;
      const url = isEdit ? `/api/vehicles?id=${vehicle._id}` : '/api/vehicles';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...payload, _id: vehicle._id } : payload),
      });

      const result = await res.json();

      if (!res.ok) {
        // Surface field-level errors if available
        const detail = result?.error?.details;
        if (detail && typeof detail === 'object') {
          const fieldErrors: Record<string, string> = {};
          Object.entries(detail).forEach(([field, msgs]) => {
            fieldErrors[field] = Array.isArray(msgs) ? msgs.join(', ') : String(msgs);
          });
          setErrors(fieldErrors);
          toast.error(result?.error?.message || 'Validation failed');
        } else {
          toast.error(result?.error?.message || 'Failed to save vehicle');
        }
        return;
      }

      toast.success(`Vehicle ${isEdit ? 'updated' : 'created'} successfully`);
      refresh();
      onSuccess?.();
      closeModal();
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* License Plate */}
        <div className="space-y-1.5">
          <Label htmlFor="license_plate" className="flex items-center gap-1.5 text-sm font-medium">
            <Hash className="h-3.5 w-3.5 text-blue-500" />
            License Plate <span className="text-red-500">*</span>
          </Label>
          <Input
            id="license_plate"
            name="license_plate"
            placeholder="e.g. ABC-1234"
            value={formData.license_plate}
            onChange={(e) => {
              const val = e.target.value.replace(/\s/g, '').toUpperCase();
              setFormData((p) => ({ ...p, license_plate: val }));
            }}
            className={cn('font-mono uppercase', errors.license_plate && 'border-red-500')}
            required
            disabled={!!vehicle?._id} // can't change plate on edit
          />
          {errors.license_plate && <p className="text-xs text-red-500">{errors.license_plate}</p>}
        </div>

        {/* Make */}
        <div className="space-y-1.5">
          <Label htmlFor="make" className="flex items-center gap-1.5 text-sm font-medium">
            <Car className="h-3.5 w-3.5 text-blue-500" />
            Make <span className="text-red-500">*</span>
          </Label>
          <Input
            id="make" name="make"
            placeholder="e.g. Toyota"
            value={formData.make}
            onChange={handleChange}
            className={errors.make ? 'border-red-500' : ''}
            required
          />
          {errors.make && <p className="text-xs text-red-500">{errors.make}</p>}
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor="model" className="flex items-center gap-1.5 text-sm font-medium">
            <Car className="h-3.5 w-3.5 text-blue-500" />
            Model <span className="text-red-500">*</span>
          </Label>
          <Input
            id="model" name="model"
            placeholder="e.g. Camry"
            value={formData.model}
            onChange={handleChange}
            className={errors.model ? 'border-red-500' : ''}
            required
          />
          {errors.model && <p className="text-xs text-red-500">{errors.model}</p>}
        </div>

        {/* Year */}
        <div className="space-y-1.5">
          <Label htmlFor="year" className="flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="h-3.5 w-3.5 text-blue-500" />
            Year <span className="text-red-500">*</span>
          </Label>
          <Input
            id="year" name="year"
            type="number"
            placeholder="e.g. 2024"
            value={formData.year}
            onChange={handleChange}
            min={1900}
            max={new Date().getFullYear() + 2}
            className={errors.year ? 'border-red-500' : ''}
            required
          />
          {errors.year && <p className="text-xs text-red-500">{errors.year}</p>}
        </div>

        {/* Vehicle Type */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Gauge className="h-3.5 w-3.5 text-blue-500" />
            Vehicle Type <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.vehicle_type}
            onValueChange={(val) => setFormData((p) => ({ ...p, vehicle_type: val as string }))}
          >
            <SelectTrigger className={errors.vehicle_type ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {vehicleTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Fuel Type */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Fuel className="h-3.5 w-3.5 text-blue-500" />
            Fuel Type <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.fuel_type}
            onValueChange={(val) => setFormData((p) => ({ ...p, fuel_type: val as string }))}
          >
            <SelectTrigger className={errors.fuel_type ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select fuel type" />
            </SelectTrigger>
            <SelectContent>
              {fuelTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Purchase Date */}
        <div className="space-y-1.5">
          <Label htmlFor="purchase_date" className="flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="h-3.5 w-3.5 text-blue-500" />
            Purchase Date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="purchase_date" name="purchase_date"
            type="date"
            value={formData.purchase_date}
            onChange={handleChange}
            className={errors.purchase_date ? 'border-red-500' : ''}
            required
          />
          {errors.purchase_date && <p className="text-xs text-red-500">{errors.purchase_date}</p>}
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Palette className="h-3.5 w-3.5 text-blue-500" />
            Color
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="h-9 w-14 cursor-pointer rounded border border-input p-0.5 bg-transparent"
            />
            <Input
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="flex-1 font-mono text-sm"
              placeholder="#3b82f6"
            />
            <div
              className="h-7 w-7 rounded-full border shadow-sm shrink-0"
              style={{ backgroundColor: formData.color }}
            />
          </div>
        </div>

        {/* Status - full width */}
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-sm font-medium">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => setFormData((p) => ({ ...p, status: val as VehicleFormData['status'] }))}
          >
            <SelectTrigger className="w-full md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${opt.color}`} />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error summary */}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <p className="font-medium mb-1">Please fix the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {Object.entries(errors).map(([field, msg]) => (
              <li key={field}><span className="font-mono">{field}</span>: {msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={closeModal} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {vehicle ? 'Updating...' : 'Adding...'}
            </span>
          ) : (
            vehicle ? 'Update Vehicle' : 'Add Vehicle'
          )}
        </Button>
      </div>
    </form>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}