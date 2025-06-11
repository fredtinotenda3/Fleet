import { FuelLog, Unit } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const FuelLogForm = ({
  units,
  editLog,
  loading,
  onSubmit,
  onCancel,
}: {
  units: Unit[];
  editLog: FuelLog | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onCancel: () => void;
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <div>
      <Label>Date</Label>
      <Input
        name="date"
        type="date"
        required
        defaultValue={
          editLog?.date
            ? new Date(editLog.date).toISOString().split("T")[0]
            : ""
        }
      />
    </div>

    <div>
      <Label>Fuel Volume</Label>
      <Input
        name="fuel_volume"
        type="number"
        step="0.01"
        required
        defaultValue={editLog?.fuel_volume}
      />
    </div>

    <div>
      <Label>Unit</Label>
      <select
        name="unit_id"
        className="w-full p-2 border rounded"
        required
        defaultValue={editLog?.unit_id || ""}
      >
        <option value="">Select Unit</option>
        {units.map((unit) => (
          <option key={unit._id} value={unit.unit_id}>
            {unit.name} ({unit.symbol})
          </option>
        ))}
      </select>
    </div>

    <div>
      <Label>Cost ($)</Label>
      <Input
        name="cost"
        type="number"
        step="0.01"
        required
        defaultValue={editLog?.cost}
      />
    </div>

    <div>
      <Label>Odometer</Label>
      <Input
        name="odometer"
        type="number"
        required
        defaultValue={editLog?.odometer}
      />
    </div>

    <div className="flex justify-end gap-2">
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Log"}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </form>
);
