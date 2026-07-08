
// frontend/modules/vehicles/utils/index.ts

import { VEHICLE_CONFIG } from '@/shared/config/constants';
import { getStatusConfig } from '@/shared/utils/status.utils';
import { getDaysUntil } from '@/shared/utils/date.utils';
import { generateCSV, downloadCSV } from '@/shared/utils/csv.utils';
import type { Vehicle } from '@/shared/types/vehicle.types';
import type { VehicleStatus } from '../types';

export const VEHICLE_TYPE_OPTIONS = VEHICLE_CONFIG.vehicleTypes;
export const FUEL_TYPE_OPTIONS = VEHICLE_CONFIG.fuelTypes;

export function vehicleDisplayName(vehicle: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function getVehicleStatusMeta(status: Vehicle['status']) {
  return getStatusConfig(status);
}

const STATUS_BADGE_CLASS: Record<VehicleStatus, string> = {
  active: 'badge-success',
  maintenance: 'badge-warning',
  inactive: 'badge-neutral',
};

export function getVehicleStatusBadgeClass(status: VehicleStatus): string {
  return STATUS_BADGE_CLASS[status] ?? 'badge-neutral';
}

export function isRegistrationExpiringSoon(date?: string, withinDays = 30): boolean {
  if (!date) return false;
  const days = getDaysUntil(date);
  return days >= 0 && days <= withinDays;
}

export function isRegistrationExpired(date?: string): boolean {
  if (!date) return false;
  return getDaysUntil(date) < 0;
}

const MANAGE_ROLES = ['organization_owner', 'fleet_manager', 'super_admin'];
const DELETE_ROLES = ['organization_owner', 'super_admin'];

export function canManageVehicles(roles: string[] = []): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

export function canDeleteVehicles(roles: string[] = []): boolean {
  return roles.some((r) => DELETE_ROLES.includes(r));
}

export function exportVehiclesToCSV(vehicles: Vehicle[]): void {
  const csv = generateCSV(vehicles, [
    { header: 'License Plate', accessor: (v) => v.license_plate },
    { header: 'Make', accessor: (v) => v.make },
    { header: 'Model', accessor: (v) => v.model },
    { header: 'Year', accessor: (v) => v.year },
    { header: 'Type', accessor: (v) => v.vehicle_type },
    { header: 'Fuel Type', accessor: (v) => v.fuel_type },
    { header: 'Status', accessor: (v) => v.status },
    { header: 'VIN', accessor: (v) => v.vin },
    { header: 'Odometer', accessor: (v) => v.odometer },
    { header: 'Registration Expiry', accessor: (v) => v.registration_expiry },
    { header: 'Insurance Provider', accessor: (v) => v.insurance_provider },
  ]);
  downloadCSV(csv, `vehicles-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportVehiclesToExcel(vehicles: Vehicle[]): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = vehicles.map((v) => ({
    'License Plate': v.license_plate,
    Make: v.make,
    Model: v.model,
    Year: v.year,
    Type: v.vehicle_type,
    'Fuel Type': v.fuel_type,
    Status: v.status,
    VIN: v.vin ?? '',
    Odometer: v.odometer ?? '',
    'Registration Expiry': v.registration_expiry ?? '',
    'Insurance Provider': v.insurance_provider ?? '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicles');
  XLSX.writeFile(workbook, `vehicles-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}