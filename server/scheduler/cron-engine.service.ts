// server/scheduler/cron-engine.service.ts

import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { queueNameForJobType } from '@/infrastructure/queue/queue.service';
import { scheduledJobRepository } from './scheduled-job.repository';
import { ScheduledJob, ScheduledJobCreateDTO, ScheduledJobUpdateDTO } from './scheduled-job.types';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

const CRON_PATTERN = /^(\*|[0-9,\-/]+)(\s+(\*|[0-9,\-/]+)){4}$/;

/**
 * The "cron engine": owns the mapping between a human-authored
 * ScheduledJob record and BullMQ's repeatable-job mechanism. Every
 * mutation here (create/update/pause/resume/delete) keeps both sides
 * consistent, and `reconcile()` (called at boot by workers/bootstrap.ts)
 * re-registers every active ScheduledJob's repeatable job so a Redis
 * flush or a fresh deployment doesn't silently lose recurring jobs.
 */
export class CronEngineService {
  async create(data: ScheduledJobCreateDTO, userId: string): Promise<ScheduledJob> {
    if (!CRON_PATTERN.test(data.cron)) {
      throw new ValidationError(`Invalid cron expression: "${data.cron}"`);
    }
    const existing = await scheduledJobRepository.findByName(data.name);
    if (existing) {
      throw new ConflictError(`A scheduled job named "${data.name}" already exists`);
    }

    const created = await scheduledJobRepository.create(
      {
        name: data.name,
        description: data.description,
        jobType: data.jobType,
        cron: data.cron,
        payload: data.payload || {},
        status: 'active',
        tenantId: 'system',
      },
      'system',
      userId
    );

    await this.registerRepeatable(created);
    await auditLog.log({ action: 'SCHEDULED_JOB_CREATED', userId, tenantId: 'system', entityType: 'scheduled_job', entityId: created._id, metadata: { name: created.name, cron: created.cron } });

    return created;
  }

  async update(id: string, data: ScheduledJobUpdateDTO, userId: string): Promise<ScheduledJob> {
    const existing = await scheduledJobRepository.findById(id, 'system', false, true);
    if (!existing) throw new NotFoundError('Scheduled job not found');
    if (data.cron && !CRON_PATTERN.test(data.cron)) {
      throw new ValidationError(`Invalid cron expression: "${data.cron}"`);
    }

    // Cron/payload changes require re-registering the repeatable job
    // under BullMQ, since the cron string is part of its identity.
    if (data.cron || data.payload) {
      await this.unregisterRepeatable(existing);
    }

    const updated = await scheduledJobRepository.update(id, data as Partial<ScheduledJob>, 'system', userId, true);
    if (!updated) throw new NotFoundError('Scheduled job not found');

    if (updated.status === 'active') {
      await this.registerRepeatable(updated);
    }

    await auditLog.log({ action: 'SCHEDULED_JOB_UPDATED', userId, tenantId: 'system', entityType: 'scheduled_job', entityId: id, metadata: data as Record<string, unknown> });
    return updated;
  }

  async pause(id: string, userId: string): Promise<ScheduledJob> {
    return this.update(id, { status: 'paused' }, userId);
  }

  async resume(id: string, userId: string): Promise<ScheduledJob> {
    return this.update(id, { status: 'active' }, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await scheduledJobRepository.findById(id, 'system', false, true);
    if (!existing) throw new NotFoundError('Scheduled job not found');
    await this.unregisterRepeatable(existing);
    await scheduledJobRepository.hardDelete(id, 'system', true);
    await auditLog.log({ action: 'SCHEDULED_JOB_DELETED', userId, tenantId: 'system', entityType: 'scheduled_job', entityId: id, metadata: { name: existing.name } });
  }

  async list(): Promise<ScheduledJob[]> {
    return scheduledJobRepository.listAll();
  }

  /** Re-registers every active ScheduledJob's repeatable job. Call once at process boot. */
  async reconcile(): Promise<void> {
    const jobs = await scheduledJobRepository.listAll();
    for (const job of jobs) {
      if (job.status !== 'active') continue;
      try {
        await this.registerRepeatable(job);
      } catch (error) {
        monitoring.logError(`[CronEngine] Failed to reconcile scheduled job "${job.name}"`, error as Error);
      }
    }
    monitoring.logInfo(`[CronEngine] Reconciled ${jobs.length} scheduled job(s)`);
  }

  private async registerRepeatable(job: ScheduledJob): Promise<void> {
    await queueService.addJob(
      job.jobType,
      { type: job.jobType, payload: job.payload, tenantId: 'system' },
      { repeat: { cron: job.cron }, jobId: `scheduled:${job._id}` }
    );
  }

  private async unregisterRepeatable(job: ScheduledJob): Promise<void> {
    const queueName = queueNameForJobType(job.jobType);
    try {
      await queueService.removeRepeatable(queueName, job.jobType, { cron: job.cron }, `scheduled:${job._id}`);
    } catch (error) {
      monitoring.logWarn(`[CronEngine] Could not unregister repeatable for "${job.name}"`, { error: (error as Error).message });
    }
  }
}

export const cronEngineService = new CronEngineService();