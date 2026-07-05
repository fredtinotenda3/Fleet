// server/scheduler/scheduled-job.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ScheduledJob } from './scheduled-job.types';

export class ScheduledJobRepository extends BaseRepository<ScheduledJob> {
  protected collectionName = 'tblscheduledjobs';

  async findByName(name: string): Promise<ScheduledJob | null> {
    return this.findOne({ name } as Filter<ScheduledJob>, 'system', false, true);
  }

  async listAll(): Promise<ScheduledJob[]> {
    return this.findMany({} as Filter<ScheduledJob>, 'system', { sortBy: 'name', sortOrder: 'asc' }, false, true);
  }

  async recordRun(id: string, status: 'success' | 'failure'): Promise<void> {
    await this.update(id, { lastRunAt: new Date(), lastRunStatus: status } as Partial<ScheduledJob>, 'system', 'system', true);
  }
}

export const scheduledJobRepository = new ScheduledJobRepository();