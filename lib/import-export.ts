import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ImportedRecord {
  date: Date;
  reference: string;
  details: string;
  account: string;
  amount: number;
  costCentre: string;
  vehiclePlate?: string;
  category?: string;
}

export interface ProcessedRecord {
  date: Date;
  reference: string;
  details: string;
  account: string;
  totalAmount: number;
  costCentre: string;
  items: string[];
  references: string[];
  vehiclePlate?: string;
  category?: string;
}

/**
 * Parse Excel file to JSON
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      resolve(jsonData);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse CSV file to JSON
 */
export async function parseCSVFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: reject,
    });
  });
}

/**
 * Extract vehicle license plate from details - ENHANCED VERSION
 */
export function extractVehiclePlate(details: string): string | undefined {
  if (!details) return undefined;
  
  // More comprehensive patterns for Zimbabwean plates
  const patterns = [
    /[A-Z]{3}\s?\d{3,4}/gi,        // ADL 5345, AFU0078
    /[A-Z]{3}-\d{3,4}/gi,           // ABC-123
    /[A-Z]{3}\d{3,4}/gi,            // ADL5345
    /\[([A-Z]{3}\s?\d{3,4})\]/gi,   // [ADY 2531]
    /_([A-Z]{3}\s?\d{3,4})/gi,      // _ADL 5345
    /\s([A-Z]{3}\s?\d{3,4})\s/gi,   // space ADL 5345 space
  ];
  
  for (const pattern of patterns) {
    const matches = details.match(pattern);
    if (matches && matches.length > 0) {
      let plate = matches[0].toUpperCase();
      plate = plate.replace(/[\[_]/g, '').replace(/\]/g, '');
      return plate.trim();
    }
  }
  return undefined;
}

/**
 * Map account name to category
 */
function mapAccountToCategory(account: string): string {
  const lowerAccount = account.toLowerCase();
  
  if (lowerAccount.includes('fuel') || lowerAccount.includes('oil')) {
    return 'Fuel & Oil';
  }
  if (lowerAccount.includes('motor expense')) {
    return 'Motor Expenses';
  }
  if (lowerAccount.includes('parking')) {
    return 'Parking Fees';
  }
  if (lowerAccount.includes('toll') || lowerAccount.includes('weighbridge')) {
    return 'Toll Fees';
  }
  return 'Motor Expenses';
}

/**
 * Map Excel columns to database fields
 */
export function mapExcelToRecord(row: any): ImportedRecord {
  const keys = Object.keys(row);
  
  const findValue = (possibleNames: string[]): any => {
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
        return row[name];
      }
      const matchKey = keys.find(k => k.toLowerCase() === name.toLowerCase());
      if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null && row[matchKey] !== "") {
        return row[matchKey];
      }
    }
    return null;
  };
  
  // Get date
  let date: Date = new Date();
  const dateValue = findValue(['DATE', 'Date', 'date', 'DAY', 'Day', 'day']);
  if (dateValue) {
    if (typeof dateValue === 'number') {
      const excelEpoch = new Date(1900, 0, 1);
      date = new Date(excelEpoch.getTime() + (dateValue - 2) * 86400000);
    } else {
      date = new Date(dateValue);
      if (isNaN(date.getTime()) && typeof dateValue === 'string' && dateValue.includes('/')) {
        const parts = dateValue.split('/');
        if (parts.length === 3) {
          date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
      }
    }
  }
  
  const reference = String(findValue(['REF', 'Ref', 'ref', 'REFERENCE', 'Reference']) || '');
  const details = String(findValue(['DETAILS', 'Details', 'details', 'DESCRIPTION', 'Description']) || '');
  const account = String(findValue(['ACCOUNT', 'Account', 'account']) || 'Motor Expenses');
  
  let amount = 0;
  const amountValue = findValue(['AMOUNT', 'Amount', 'amount', 'VALUE', 'Value', 'TOTAL', 'Total']);
  if (amountValue) {
    if (typeof amountValue === 'string') {
      amount = parseFloat(amountValue.replace(/[^0-9.-]/g, ''));
    } else {
      amount = Number(amountValue);
    }
  }
  
  const costCentre = String(findValue(['COST CENTRE', 'Cost Centre', 'COST CENTER', 'Cost Center']) || 'HRE');
  const vehiclePlate = extractVehiclePlate(details);
  const category = mapAccountToCategory(account);

  return {
    date: isNaN(date.getTime()) ? new Date() : date,
    reference,
    details,
    account,
    amount: isNaN(amount) ? 0 : amount,
    costCentre,
    vehiclePlate,
    category,
  };
}

/**
 * Process raw data and group by vehicle + date
 * Each vehicle gets its own separate records
 */
export function processRecordsByVehicle(records: ImportedRecord[]): ProcessedRecord[] {
  // Group by vehicle + date combination
  const groupedByVehicleAndDate = new Map<string, ProcessedRecord>();

  for (const record of records) {
    const vehicleKey = record.vehiclePlate || "UNKNOWN";
    const dateKey = record.date.toDateString();
    const groupKey = `${vehicleKey}|${dateKey}`;
    
    if (groupedByVehicleAndDate.has(groupKey)) {
      const existing = groupedByVehicleAndDate.get(groupKey)!;
      existing.totalAmount += record.amount;
      existing.items.push(record.details);
      existing.references.push(record.reference);
    } else {
      groupedByVehicleAndDate.set(groupKey, {
        date: record.date,
        reference: record.reference,
        details: record.details,
        account: record.account,
        totalAmount: record.amount,
        costCentre: record.costCentre,
        items: [record.details],
        references: [record.reference],
        vehiclePlate: record.vehiclePlate,
        category: record.category,
      });
    }
  }

  return Array.from(groupedByVehicleAndDate.values());
}

/**
 * Export data to Excel
 */
export function exportToExcel(data: any[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export data to CSV
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Convert data to CSV rows
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Wrap in quotes if contains comma
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  // Create blob and download
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}