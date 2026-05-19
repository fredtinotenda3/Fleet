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
import * as XLSX from 'xlsx';
import { exportToExcel, extractVehiclePlate, processRecordsByVehicle } from "@/lib/import-export";
import { Upload, Download, Loader2 } from "lucide-react";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (records: any[]) => Promise<void>;
}

async function parseExcelDirect(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      resolve(jsonData);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function ImportModal({ open, onOpenChange, onImport }: ImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [vehiclesFound, setVehiclesFound] = useState<string[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setPreviewData([]);

    try {
      const rows = await parseExcelDirect(file);
      
      if (!rows || rows.length < 3) {
        toast.error("File has too few rows");
        return;
      }
      
      // Find header row
      let headerRowIndex = -1;
      let headerRow: any[] = [];
      
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rowStr = JSON.stringify(row).toUpperCase();
        if (rowStr.includes('DATE') && rowStr.includes('REF') && rowStr.includes('AMOUNT')) {
          headerRowIndex = i;
          headerRow = row;
          break;
        }
      }
      
      if (headerRowIndex === -1) {
        toast.error("Could not find header row with DATE, REF, AMOUNT columns");
        return;
      }
      
      // Map column indices
      const colIndex: Record<string, number> = {};
      headerRow.forEach((col, idx) => {
        const colName = String(col || '').toUpperCase().trim();
        if (colName.includes('DATE')) colIndex.date = idx;
        if (colName.includes('REF')) colIndex.ref = idx;
        if (colName.includes('DETAIL')) colIndex.details = idx;
        if (colName.includes('ACCOUNT')) colIndex.account = idx;
        if (colName.includes('AMOUNT')) colIndex.amount = idx;
        if (colName.includes('COST') || colName.includes('CENTRE')) colIndex.costCentre = idx;
      });
      
      if (colIndex.date === undefined || colIndex.amount === undefined) {
        toast.error("Required columns not found. Need DATE and AMOUNT columns.");
        return;
      }
      
      // Process data rows
      const dataRows = rows.slice(headerRowIndex + 1);
      const records: any[] = [];
      const uniqueVehicles = new Set<string>();
      
      for (const row of dataRows) {
        if (!row || row.length === 0) continue;
        
        const dateValue = row[colIndex.date];
        const amountValue = row[colIndex.amount];
        
        if (!dateValue || !amountValue) continue;
        
        let amount = 0;
        if (typeof amountValue === 'string') {
          amount = parseFloat(amountValue.replace(/[^0-9.-]/g, ''));
        } else {
          amount = Number(amountValue);
        }
        
        if (isNaN(amount) || amount <= 0) continue;
        
        // Parse date
        let date = new Date();
        if (typeof dateValue === 'number') {
          const excelEpoch = new Date(1900, 0, 1);
          date = new Date(excelEpoch.getTime() + (dateValue - 2) * 86400000);
        } else {
          date = new Date(dateValue);
          if (isNaN(date.getTime())) {
            const dateStr = String(dateValue);
            const parts = dateStr.split(/[-\/]/);
            if (parts.length >= 3) {
              date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
          }
        }
        
        const reference = colIndex.ref !== undefined ? String(row[colIndex.ref] || '') : '';
        const details = colIndex.details !== undefined ? String(row[colIndex.details] || '') : '';
        const account = colIndex.account !== undefined ? String(row[colIndex.account] || 'Motor Expenses') : 'Motor Expenses';
        const costCentre = colIndex.costCentre !== undefined ? String(row[colIndex.costCentre] || 'HRE') : 'HRE';
        
        // Extract vehicle plate
        const vehiclePlate = extractVehiclePlate(details);
        if (vehiclePlate) {
          uniqueVehicles.add(vehiclePlate);
        }
        
        records.push({
          date,
          reference,
          details,
          account,
          amount,
          costCentre,
          vehiclePlate,
        });
      }
      
      setVehiclesFound(Array.from(uniqueVehicles));
      
      if (records.length === 0) {
        toast.error("No valid records found");
        return;
      }
      
      // Group by vehicle + date
      const processedRecords = processRecordsByVehicle(records);
      setPreviewData(processedRecords);
      
      const vehicleCount = uniqueVehicles.size;
      toast.success(`Loaded ${records.length} records for ${vehicleCount} vehicle(s), merged into ${processedRecords.length} daily records`);
      
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (previewData.length === 0) {
      toast.error("No data to import");
      return;
    }

    setLoading(true);
    try {
      await onImport(previewData);
      toast.success(`Successfully imported ${previewData.length} records`);
      onOpenChange(false);
      setPreviewData([]);
      setFileName("");
      setVehiclesFound([]);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import data");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      ["DATE", "REF", "DETAILS", "ACCOUNT", "AMOUNT", "COST CENTRE"],
      ["2026-01-01", "Req 9895", "Sogo Fuels - ADL 5345", "Fuel & Oil Distribution Cost", 62, "HRE"],
      ["2026-01-03", "Req 9941", "Damz Motor Mech - Brake Repair ADY 2531", "Motor Expenses", 400, "HRE"],
      ["2026-01-08", "Req 14015", "AFU 0078 - Fuel", "Fuel & Oil Distribution Cost", 24, "HRE"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "import-template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Expenses</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">📋 Import Instructions</p>
            <p className="text-xs text-muted-foreground mb-3">
              Your Excel file should have these columns: DATE, REF, DETAILS, ACCOUNT, AMOUNT, COST CENTRE
              <br />The system will automatically detect vehicle plates in the DETAILS column and create separate vehicles.
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {vehiclesFound.length > 0 && (
            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
              <p className="text-sm font-medium">🚗 Vehicles detected in this file:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {vehiclesFound.map(v => (
                  <span key={v} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-xs font-mono">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={parsing}
            />
            <Label htmlFor="file-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                {parsing ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {parsing ? "Parsing file..." : (fileName || "Click to upload Excel file")}
                </span>
                <span className="text-xs text-muted-foreground">
                  Supports .xlsx, .xls files
                </span>
              </div>
            </Label>
          </div>

          {previewData.length > 0 && (
            <>
              <div>
                <h3 className="font-semibold mb-2">Preview ({previewData.length} records)</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Each vehicle gets its own separate records. Records from the same day and same vehicle are merged.
                </p>
                <div className="overflow-x-auto border rounded-lg max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Vehicle</th>
                        <th className="p-2 text-left">Reference(s)</th>
                        <th className="p-2 text-left">Account</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((record, idx) => (
                        <tr key={idx} className="border-t hover:bg-muted/50">
                          <td className="p-2 whitespace-nowrap">
                            {record.date instanceof Date ? record.date.toLocaleDateString() : new Date(record.date).toLocaleDateString()}
                          </td>
                          <td className="p-2">
                            {record.vehiclePlate ? (
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-xs font-mono font-semibold">
                                {record.vehiclePlate}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">UNKNOWN</span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs max-w-[150px] truncate">
                            {record.references ? record.references.slice(0, 2).join(", ") : record.reference}
                            {record.references?.length > 2 ? ` (+${record.references.length - 2})` : ""}
                          </td>
                          <td className="p-2">{record.account || "-"}</td>
                          <td className="p-2 text-right font-medium">
                            ${(record.totalAmount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {loading ? "Importing..." : `Import ${previewData.length} Records`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}