// components/vehicles/sections/fuel/FuelLogTable.tsx
import { FuelLog, Unit } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface FuelLogTableProps {
  logs: FuelLog[];
  units: Unit[];
  onEdit?: (log: FuelLog) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
}

export const FuelLogTable = ({
  logs,
  units,
  onEdit,
  onDelete,
  loading = false,
}: FuelLogTableProps) => (
  <div className="rounded-lg border">
    {loading ? (
      <div className="p-4 text-center text-muted-foreground">
        Loading fuel logs...
      </div>
    ) : (
      <table className="min-w-full table-auto border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Fuel Volume</th>
            <th className="p-2 text-left">Unit</th>
            <th className="p-2 text-left">Cost</th>
            <th className="p-2 text-left">Odometer</th>
            {(onEdit || onDelete) && <th className="p-2 text-left">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-2 text-center text-muted-foreground">
                No fuel logs found
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log._id} className="hover:bg-muted/50">
                <td className="p-2">{formatDate(log.date)}</td>
                <td className="p-2">{log.fuel_volume}</td>
                <td className="p-2">
                  <Badge variant="outline">
                    {log.unit?.symbol ||
                      units.find((u) => u.unit_id === log.unit_id)?.symbol}
                  </Badge>
                </td>
                <td className="p-2">${log.cost.toFixed(2)}</td>
                <td className="p-2">{log.odometer.toLocaleString()}</td>
                {(onEdit || onDelete) && (
                  <td className="p-2 flex gap-2">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(log)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && log._id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(log._id!)} // <- FIXED: using non-null assertion
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    )}
  </div>
);
