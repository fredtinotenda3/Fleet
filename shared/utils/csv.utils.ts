// shared/utils/csv.utils.ts

export interface ExportColumn<T> {
  header: string;
  accessor: (item: T) => string | number;
}

export function generateCSV<T>(
  data: T[],
  columns: ExportColumn<T>
): string {
  const headers = columns.header;
  const rows = data.map(item => 
    columns.accessor(item)
  );
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      Array.isArray(row) 
        ? row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        : `"${String(row).replace(/"/g, '""')}"`
    ),
  ].join('\n');
  
  return csvContent;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV<T>(
  data: T[],
  columns: ExportColumn<T>,
  filename: string
): void {
  const csv = generateCSV(data, columns);
  downloadCSV(csv, filename);
}