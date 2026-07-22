// modules/fuel/export/fuel-export.columns.ts
//
// Column definitions for the Fuel Logs export. Extends the field set
// used by the pre-Phase-2 client-side exportFuelLogsToCSV in
// frontend/modules/fuel/utils/index.ts (which fell back to CSV for
// "Excel" exports since it had no shared column model) with the
// driver/station/payment fields already available on FuelLog once
// FuelRepository.enrichFuelLogs() has run.

import type { ExportColumn } from '@/shared/export';
import type { FuelLog } from '@/shared/types/fuel.types';

export const FUEL_EXPORT_COLUMNS: ExportColumn<FuelLog>[] = [
  { header: 'Date', accessor: (f) => new Date(f.date).toISOString().slice(0, 10) },
  { header: 'License Plate', accessor: (f) => f.license_plate },
  { header: 'Volume', accessor: (f) => f.fuel_volume },
  { header: 'Unit', accessor: (f) => f.unit?.symbol ?? '' },
  { header: 'Cost', accessor: (f) => f.cost },
  { header: 'Currency', accessor: (f) => f.currency ?? 'USD' },
  { header: 'Odometer', accessor: (f) => f.odometer ?? '' },
  { header: 'Fuel Type', accessor: (f) => f.fuel_type ?? '' },
  { header: 'Station', accessor: (f) => f.fuel_station?.name ?? f.station_name ?? '' },
  { header: 'Driver', accessor: (f) => f.driver?.name ?? '' },
  { header: 'Payment Method', accessor: (f) => f.payment_method ?? '' },
  { header: 'Full Tank', accessor: (f) => (f.is_full_tank ? 'Yes' : 'No') },
  { header: 'Notes', accessor: (f) => f.notes ?? '' },
];

export const FUEL_EXPORT_SHEET_NAME = 'Fuel Logs';
export const FUEL_EXPORT_BASE_FILENAME = 'fuel-logs-export';