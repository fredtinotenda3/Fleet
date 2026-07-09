// frontend/modules/fuel/utils/index.ts

export function canManageFuel(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager', 'accountant'].includes(r));
}

export function canDeleteFuel(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager'].includes(r));
}

export function canViewFuel(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'accountant', 'auditor', 'viewer'].includes(r)
  );
}

interface ExportableFuelLog {
  date: string | Date;
  license_plate: string;
  fuel_volume: number;
  unit?: { symbol?: string };
  currency?: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  is_full_tank?: boolean;
}

export function exportFuelLogsToCSV(logs: ExportableFuelLog[]): void {
  if (!logs.length) return;

  const headers = ['Date', 'License Plate', 'Volume', 'Cost', 'Odometer', 'Station', 'Full Tank'];
  const rows = logs.map((log) => [
    new Date(log.date).toLocaleDateString(),
    log.license_plate,
    `${log.fuel_volume} ${log.unit?.symbol || 'L'}`,
    `${log.currency || 'USD'} ${log.cost.toFixed(2)}`,
    String(log.odometer ?? ''),
    log.station_name || 'N/A',
    log.is_full_tank ? 'Yes' : 'No',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fuel-logs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

export async function exportFuelLogsToExcel(logs: ExportableFuelLog[]): Promise<void> {
  // Falls back to CSV until an xlsx generator is wired up for this module.
  exportFuelLogsToCSV(logs);
}

export function printFuelLogs(): void {
  window.print();
}