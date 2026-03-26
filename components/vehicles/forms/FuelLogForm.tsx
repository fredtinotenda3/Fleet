import React, { useEffect, useState } from "react";
import { Unit, FuelLog } from "@/types";

interface FuelLogFormProps {
  initialData?: FuelLog;
  license_plate: string;
  units: Unit[];
  onSubmit: (data: {
    date: string;
    fuel_volume: number;
    cost: number;
    odometer?: number;
    unit_id: string;
    license_plate: string;
  }) => void;
  onCancel: () => void;
}

export function FuelLogForm({
  initialData,
  license_plate,
  units,
  onSubmit,
  onCancel,
}: FuelLogFormProps) {
  const [date, setDate] = useState(
    initialData ? new Date(initialData.date).toISOString().slice(0, 10) : ""
  );
  const [fuelVolume, setFuelVolume] = useState(
    initialData?.fuel_volume.toString() || ""
  );
  const [cost, setCost] = useState(initialData?.cost.toString() || "");
  const [odometer, setOdometer] = useState(
    initialData?.odometer?.toString() || ""
  );
  const [unitId, setUnitId] = useState(
    initialData?.unit_id || units[0]?.unit_id || ""
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setDate(new Date(initialData.date).toISOString().slice(0, 10));
      setFuelVolume(initialData.fuel_volume.toString());
      setCost(initialData.cost.toString());
      setOdometer(initialData.odometer?.toString() || "");
      setUnitId(initialData.unit_id || units[0]?.unit_id || "");
    } else {
      setDate("");
      setFuelVolume("");
      setCost("");
      setOdometer("");
      setUnitId(units[0]?.unit_id || "");
      setError(null);
    }
  }, [initialData, units]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!date || !fuelVolume || !cost || !unitId) {
      setError("Date, fuel volume, cost and unit are required.");
      return;
    }

    const fuelVolumeNum = Number(fuelVolume);
    const costNum = Number(cost);

    if (isNaN(fuelVolumeNum) || fuelVolumeNum <= 0) {
      setError("Fuel volume must be a positive number.");
      return;
    }

    if (isNaN(costNum) || costNum < 0) {
      setError("Cost must be a valid non-negative number.");
      return;
    }

    // Odometer is optional — only validate if provided
    let odometerNum: number | undefined;
    if (odometer !== "") {
      odometerNum = Number(odometer);
      if (isNaN(odometerNum) || odometerNum < 0) {
        setError("Odometer must be a valid non-negative number.");
        return;
      }
    }

    setError(null);
    onSubmit({
      date,
      fuel_volume: fuelVolumeNum,
      cost: costNum,
      ...(odometerNum !== undefined && { odometer: odometerNum }),
      unit_id: unitId,
      license_plate: license_plate.toUpperCase(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <label htmlFor="date" className="block font-medium text-sm mb-1">
          Date <span className="text-red-500">*</span>
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="block w-full border rounded px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label htmlFor="fuelVolume" className="block font-medium text-sm mb-1">
          Fuel Volume <span className="text-red-500">*</span>
        </label>
        <input
          id="fuelVolume"
          type="number"
          min="0"
          step="any"
          value={fuelVolume}
          onChange={(e) => setFuelVolume(e.target.value)}
          className="block w-full border rounded px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label htmlFor="unit" className="block font-medium text-sm mb-1">
          Unit <span className="text-red-500">*</span>
        </label>
        <select
          id="unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="block w-full border rounded px-3 py-2 text-sm"
          required
        >
          <option value="">Select unit</option>
          {units.map((unit) => (
            <option key={unit.unit_id} value={unit.unit_id}>
              {unit.name} ({unit.symbol})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="cost" className="block font-medium text-sm mb-1">
          Cost <span className="text-red-500">*</span>
        </label>
        <input
          id="cost"
          type="number"
          min="0"
          step="any"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="block w-full border rounded px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label htmlFor="odometer" className="block font-medium text-sm mb-1">
          Odometer{" "}
          <span className="text-muted-foreground text-xs font-normal">
            (optional)
          </span>
        </label>
        <input
          id="odometer"
          type="number"
          min="0"
          step="any"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          placeholder="Leave blank if unknown"
          className="block w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </form>
  );
}
