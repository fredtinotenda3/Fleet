import { MeterLog, Unit } from "@/types/index";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const MeterLogsTable = ({
  logs,
  units,
  setEditLog,
  setOpen,
  handleDelete,
}: {
  logs: MeterLog[];
  units: Unit[];
  setEditLog: (log: MeterLog | null) => void;
  setOpen: (open: boolean) => void;
  handleDelete: (logId: string) => void;
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Odometer</TableHead>
        <TableHead>Unit</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {logs.map((log) => (
        <TableRow key={log._id}>
          <TableCell>
            {new Date(log.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </TableCell>
          <TableCell>{log.odometer.toLocaleString()}</TableCell>
          <TableCell>
            <Badge variant="outline">
              {units.find((u) => u.unit_id === log.unit_id)?.symbol || "N/A"}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditLog(log);
                  setOpen(true);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => log._id && handleDelete(log._id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
