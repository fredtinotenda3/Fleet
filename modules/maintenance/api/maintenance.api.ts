// modules/maintenance/api/maintenance.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { Reminder, ReminderCreateDTO, ReminderUpdateDTO, MaintenanceFilters, MaintenanceStats } from '@/shared/types/maintenance.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/reminders';

export const maintenanceApi = {
  async getReminders(filters: MaintenanceFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Reminder>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.assigned_to && { assigned_to: filters.assigned_to }),
      ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
    };
    
    return apiClient.get<PaginatedResponse<Reminder>>(BASE_URL, { params });
  },

  async getReminderById(id: string): Promise<Reminder> {
    return apiClient.get<Reminder>(BASE_URL, { params: { id } });
  },

  async getMaintenanceStats(): Promise<MaintenanceStats> {
    return apiClient.get<MaintenanceStats>(BASE_URL, { params: { action: 'stats' } });
  },

  async getOverdueReminders(): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(BASE_URL, { params: { action: 'overdue' } });
  },

  async getUpcomingReminders(daysAhead: number = 7): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(BASE_URL, { params: { action: 'upcoming', daysAhead } });
  },

  async createReminder(data: ReminderCreateDTO): Promise<Reminder> {
    return apiClient.post<Reminder>(BASE_URL, data);
  },

  async updateReminder(id: string, data: ReminderUpdateDTO): Promise<Reminder> {
    return apiClient.put<Reminder>(BASE_URL, data, { params: { id } });
  },

  async completeReminder(id: string): Promise<Reminder> {
    return apiClient.put<Reminder>(BASE_URL, { status: 'completed', completion_date: new Date() }, { params: { id, action: 'complete' } });
  },

  async deleteReminder(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },
};

export default maintenanceApi;