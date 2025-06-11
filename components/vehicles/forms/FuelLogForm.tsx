import React, { useEffect, useState } from "react";
import { Unit, FuelLog } from "@/types";

interface FuelLogFormProps {
  initialData?: FuelLog;
  license_plate: string; // always required, from parent component
  units: Unit[];
  onSubmit: (data: {
    date: string;
    fuel_volume: number;
    cost: number;
    odometer: number;
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
    initialData?.odometer.toString() || ""
  );
  const [unitId, setUnitId] = useState(
    initialData?.unit_id || units[0]?._id || ""
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setDate(new Date(initialData.date).toISOString().slice(0, 10));
      setFuelVolume(initialData.fuel_volume.toString());
      setCost(initialData.cost.toString());
      setOdometer(initialData.odometer.toString());
      setUnitId(initialData.unit_id || units[0]?._id || "");
    } else {
      setDate("");
      setFuelVolume("");
      setCost("");
      setOdometer("");
      setUnitId(units[0]?._id || "");
      setError(null);
    }
  }, [initialData, units]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!date || !fuelVolume || !cost || !odometer || !unitId) {
      setError("All fields are required.");
      return;
    }

    const fuelVolumeNum = Number(fuelVolume);
    const costNum = Number(cost);
    const odometerNum = Number(odometer);

    if (
      isNaN(fuelVolumeNum) ||
      isNaN(costNum) ||
      isNaN(odometerNum) ||
      fuelVolumeNum <= 0 ||
      costNum < 0 ||
      odometerNum < 0
    ) {
      setError("Please enter valid positive numbers.");
      return;
    }

    onSubmit({
      date,
      fuel_volume: fuelVolumeNum,
      cost: costNum,
      odometer: odometerNum,
      unit_id: unitId,
      license_plate: license_plate.toUpperCase(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <label htmlFor="date" className="block font-medium">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
        />
      </div>

      <div>
        <label htmlFor="fuelVolume" className="block font-medium">
          Fuel Volume
        </label>
        <input
          id="fuelVolume"
          type="number"
          min="0"
          step="any"
          value={fuelVolume}
          onChange={(e) => setFuelVolume(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
        />
      </div>

      <div>
        <label htmlFor="cost" className="block font-medium">
          Cost
        </label>
        <input
          id="cost"
          type="number"
          min="0"
          step="any"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
        />
      </div>

      <div>
        <label htmlFor="odometer" className="block font-medium">
          Odometer
        </label>
        <input
          id="odometer"
          type="number"
          min="0"
          step="any"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
        />
      </div>

      <div>
        <label htmlFor="unit" className="block font-medium">
          Unit
        </label>
        <select
          id="unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
        >
          {units.map((unit) => (
            <option key={unit._id} value={unit._id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </form>
  );
}
