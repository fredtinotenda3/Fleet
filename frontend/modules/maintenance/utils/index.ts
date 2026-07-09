// frontend/modules/maintenance/utils/index.ts

import { formatDate, isOverdue as dateIsOverdue } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { Reminder, ReminderStatus, Priority } from '../types';

export function canManageMaintenance(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'mechanic'].includes(r)
  );
}

export function canDeleteMaintenance(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager'].includes(r));
}

export function canCompleteMaintenance(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'mechanic'].includes(r)
  );
}

export const STATUS_BADGE_CLASSES: Record<ReminderStatus, string> = {
  pending: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export const PRIORITY_BADGE_CLASSES: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export function getStatusLabel(status: ReminderStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getPriorityLabel(priority?: Priority): string {
  if (!priority) return 'Medium';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function isRecordOverdue(record: Reminder): boolean {
  if (record.status === 'completed' || record.status === 'cancelled') return false;
  return record.status === 'overdue' || dateIsOverdue(record.due_date);
}

export function formatEstimatedCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  return formatCurrency(cost);
}

const CSV_HEADERS = [
  'License Plate',
  'Title',
  'Category',
  'Priority',
  'Status',
  'Due Date',
  'Completion Date',
  'Assigned To',
  'Estimated Cost',
  'Notes',
];

function csvEscape(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function exportMaintenanceToCSV(records: Reminder[]): void {
  const rows = records.map((r) => [
    r.license_plate,
    r.title,
    r.category ?? '',
    r.priority ?? '',
    r.status,
    formatDate(r.due_date),
    r.completion_date ? formatDate(r.completion_date) : '',
    r.assigned_to ?? '',
    r.estimated_cost ?? '',
    r.notes ?? '',
  ]);
  const csv = [CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `maintenance-records-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportMaintenanceToExcel(records: Reminder[]): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = records.map((r) => ({
    'License Plate': r.license_plate,
    Title: r.title,
    Category: r.category ?? '',
    Priority: r.priority ?? '',
    Status: r.status,
    'Due Date': formatDate(r.due_date),
    'Completion Date': r.completion_date ? formatDate(r.completion_date) : '',
    'Assigned To': r.assigned_to ?? '',
    'Estimated Cost': r.estimated_cost ?? '',
    Notes: r.notes ?? '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Maintenance');
  XLSX.writeFile(workbook, `maintenance-records-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function printMaintenanceRecords(): void {
  window.print();
}