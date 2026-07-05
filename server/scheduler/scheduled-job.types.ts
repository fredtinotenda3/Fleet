// server/scheduler/scheduled-job.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { JobType } from '@/infrastructure/queue/queue.service';

export type ScheduledJobStatus = 'active' | 'paused';

/**
 * A persisted definition of a recurring job. BullMQ's own `repeat: {
 * cron }` option is the actual scheduling mechanism, but BullMQ has no
 * concept of "here is the human-readable list of every recurring job
 * in the system with who created it and why" â€” this collection is that
 * catalogue, and CronEngineService keeps it in sync with BullMQ's
 * repeatable-job set on every mutation and at boot.
 */
export interface ScheduledJob extends BaseEntity {
  name: string;
  description?: string;
  jobType: JobType;
  cron: string;
  payload: Record<string, unknown>;
  status: ScheduledJobStatus;
  lastRunAt?: Date;
  lastRunStatus?: 'success' | 'failure';
  nextRunAt?: Date;
}

export interface ScheduledJobCreateDTO {
  name: string;
  description?: string;
  jobType: JobType;
  cron: string;
  payload?: Record<string, unknown>;
}

export interface ScheduledJobUpdateDTO {
  description?: string;
  cron?: string;
  payload?: Record<string, unknown>;
  status?: ScheduledJobStatus;
}