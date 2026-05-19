// modules/maintenance/repositories/maintenance.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Reminder, ReminderStatus, MaintenanceFilters, MaintenanceStats } from '@/shared/types/maintenance.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';

export class MaintenanceRepository extends BaseRepository<Reminder> {
  protected collectionName = 'tblreminders';

  async findByLicensePlate(licensePlate: string, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Reminder>> {
    return this.findWithPagination({ license_plate: licensePlate.toUpperCase() }, pagination, tenantId);
  }

  async getFilteredReminders(filters: MaintenanceFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Reminder>> {
    const filter: Filter<Reminder> = {};

    if (filters.license_plate) {
      filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.status) {
      filter.status = filters.status;
    }
    if (filters.priority) {
      filter.priority = filters.priority;
    }
    if (filters.assigned_to) {
      filter.assigned_to = filters.assigned_to;
    }
    if (filters.startDate || filters.endDate) {
      filter.due_date = {};
      if (filters.startDate) filter.due_date.$gte = filters.startDate;
      if (filters.endDate) filter.due_date.$lte = filters.endDate;
    }

    return this.findWithPagination(filter, pagination, tenantId);
  }

  async getOverdueReminders(tenantId: string): Promise<Reminder[]> {
    const now = new Date();
    return this.findMany({ status: 'pending', due_date: { $lt: now } }, tenantId);
  }

  async getMaintenanceStats(tenantId: string): Promise<MaintenanceStats> {
    const collection = await this.getCollection();
    const filter = this.getActiveFilter(tenantId);

    const [total, completed, pending, overdue] = await Promise.all([
      collection.countDocuments(filter),
      collection.countDocuments({ ...filter, status: 'completed' }),
      collection.countDocuments({ ...filter, status: 'pending', due_date: { $gte: new Date() } }),
      collection.countDocuments({ ...filter, status: 'pending', due_date: { $lt: new Date() } }),
    ]);

    // Calculate average completion days
    const completionDaysPipeline = [
      { $match: { ...filter, status: 'completed', completion_date: { $exists: true } } },
      {
        $project: {
          daysDiff: {
            $dateDiff: { startDate: '$due_date', endDate: '$completion_date', unit: 'day' },
          },
        },
      },
      { $group: { _id: null, avgDays: { $avg: '$daysDiff' } } },
    ];

    const avgResult = await collection.aggregate(completionDaysPipeline).toArray();
    const averageCompletionDays = Math.round(avgResult[0]?.avgDays || 0);

    return {
      total,
      completed,
      pending,
      overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      averageCompletionDays,
    };
  }

  async getUpcomingReminders(tenantId: string, daysAhead: number = 7): Promise<Reminder[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    
    return this.findMany({
      status: 'pending',
      due_date: { $gte: now, $lte: future },
    }, tenantId);
  }

  async completeReminder(id: string, tenantId: string, userId?: string): Promise<Reminder | null> {
    return this.update(id, {
      status: 'completed',
      completion_date: new Date(),
    }, tenantId, userId);
  }
}

export const maintenanceRepository = new MaintenanceRepository();