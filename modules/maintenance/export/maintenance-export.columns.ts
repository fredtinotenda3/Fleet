// modules/maintenance/export/maintenance-export.columns.ts
//
// Column definitions for the Maintenance export. Mirrors CSV_HEADERS
// in frontend/modules/maintenance/utils/index.ts.

import type { ExportColumn } from '@/shared/export';
import type { Reminder } from '@/shared/types/maintenance.types';

export const MAINTENANCE_EXPORT_COLUMNS: ExportColumn<Reminder>[] = [
  { header: 'License Plate', accessor: (r) => r.license_plate },
  { header: 'Title', accessor: (r) => r.title },
  { header: 'Category', accessor: (r) => r.category ?? '' },
  { header: 'Priority', accessor: (r) => r.priority ?? '' },
  { header: 'Status', accessor: (r) => r.status },
  { header: 'Due Date', accessor: (r) => new Date(r.due_date).toISOString().slice(0, 10) },
  {
    header: 'Completion Date',
    accessor: (r) => (r.completion_date ? new Date(r.completion_date).toISOString().slice(0, 10) : ''),
  },
  { header: 'Assigned To', accessor: (r) => r.assigned_to ?? '' },
  { header: 'Estimated Cost', accessor: (r) => r.estimated_cost ?? '' },
  { header: 'Notes', accessor: (r) => r.notes ?? '' },
];

export const MAINTENANCE_EXPORT_SHEET_NAME = 'Maintenance';
export const MAINTENANCE_EXPORT_BASE_FILENAME = 'maintenance-records-export';