import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Vehicle } from "@/types/index";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "bg-green-500" },
  { value: "inactive", label: "Inactive", color: "bg-red-500" },
  { value: "maintenance", label: "Maintenance", color: "bg-yellow-500" },
];

export const StatusDropdownSelect = ({
  status,
  vehicleId,
  onStatusChange,
}: {
  status: Vehicle["status"];
  vehicleId: string;
  onStatusChange: (vehicleId: string, newStatus: Vehicle["status"]) => void;
}) => (
  <Select
    value={status}
    onValueChange={(value) =>
      onStatusChange(vehicleId, value as Vehicle["status"])
    }
  >
    <SelectTrigger className="w-[140px]">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            STATUS_OPTIONS.find((opt) => opt.value === status)?.color ||
            "bg-gray-500"
          }`}
        />
        <SelectValue placeholder="Select status" />
      </div>
    </SelectTrigger>
    <SelectContent>
      {STATUS_OPTIONS.map((status) => (
        <SelectItem key={status.value} value={status.value}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.color}`} />
            {status.label}
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
