"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { exportToExcel, exportToCSV } from "@/lib/import-export";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any[];
  title: string;
}

export function ExportModal({ open, onOpenChange, data, title }: ExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("excel");

  const filteredData = data.filter(item => {
    if (startDate && new Date(item.date) < startDate) return false;
    if (endDate && new Date(item.date) > endDate) return false;
    return true;
  });

  const handleExport = () => {
    if (filteredData.length === 0) {
      toast.error("No data to export");
      return;
    }

    const filename = `${title.toLowerCase().replace(/\s/g, "-")}-${new Date().toISOString().split("T")[0]}`;
    
    if (exportFormat === "excel") {
      exportToExcel(filteredData, filename);
    } else {
      exportToCSV(filteredData, filename);
    }
    
    toast.success(`Exported ${filteredData.length} records`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date Range Filter */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>End Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Export Format */}
          <div>
            <Label>Export Format</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                variant={exportFormat === "excel" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setExportFormat("excel")}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel (.xlsx)
              </Button>
              <Button
                type="button"
                variant={exportFormat === "csv" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setExportFormat("csv")}
              >
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm">
              Total records: <strong>{filteredData.length}</strong>
            </p>
            {startDate && (
              <p className="text-sm text-muted-foreground">
                From: {format(startDate, "PPP")}
              </p>
            )}
            {endDate && (
              <p className="text-sm text-muted-foreground">
                To: {format(endDate, "PPP")}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              Export {filteredData.length} Records
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}