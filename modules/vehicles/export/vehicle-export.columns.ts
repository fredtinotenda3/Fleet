// modules/vehicles/export/vehicle-export.columns.ts
//
// Column definitions for the Vehicles export. Mirrors the fields
// already used by the pre-Phase-2 client-side
// exportVehiclesToCSV/exportVehiclesToExcel in
// frontend/modules/vehicles/utils/index.ts so the exported file's
// shape doesn't change for users, only where it's generated and how
// much data it contains.

import type { ExportColumn } from '@/shared/export';
import type { Vehicle } from '@/shared/types/vehicle.types';

export const VEHICLE_EXPORT_COLUMNS: ExportColumn<Vehicle>[] = [
  { header: 'License Plate', accessor: (v) => v.license_plate },
  { header: 'Make', accessor: (v) => v.make },
  { header: 'Model', accessor: (v) => v.model },
  { header: 'Year', accessor: (v) => v.year },
  { header: 'Type', accessor: (v) => v.vehicle_type },
  { header: 'Fuel Type', accessor: (v) => v.fuel_type },
  { header: 'Status', accessor: (v) => v.status },
  { header: 'VIN', accessor: (v) => v.vin ?? '' },
  { header: 'Odometer', accessor: (v) => v.odometer ?? '' },
  { header: 'Registration Expiry', accessor: (v) => v.registration_expiry ?? '' },
  { header: 'Insurance Provider', accessor: (v) => v.insurance_provider ?? '' },
];

export const VEHICLE_EXPORT_SHEET_NAME = 'Vehicles';
export const VEHICLE_EXPORT_BASE_FILENAME = 'vehicles-export';