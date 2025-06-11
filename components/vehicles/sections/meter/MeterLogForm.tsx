import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeterLog, Unit } from "@/types/index";

export const MeterLogForm = ({
  open,
  setOpen,
  editLog,
  setEditLog,
  loading,
  handleSubmit,
  units,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  editLog: MeterLog | null;
  setEditLog: (log: MeterLog | null) => void;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  units: Unit[];
}) => (
  <Dialog
    open={open}
    onOpenChange={(open) => {
      if (!open) setEditLog(null);
      setOpen(open);
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {editLog ? "Edit Meter Log" : "New Meter Log"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <Label>Odometer</Label>
          <Input
            name="odometer"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={editLog?.odometer}
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

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Processing..." : "Save"}
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
);
