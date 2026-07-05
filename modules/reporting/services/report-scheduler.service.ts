
// modules/reporting/services/report-scheduler.service.ts

import { cronEngineService } from '@/server/scheduler/cron-engine.service';
import { scheduledJobRepository } from '@/server/scheduler/scheduled-job.repository';
import { JobType } from '@/infrastructure/queue/queue.service';
import { ReportDefinition, ReportScheduleConfig } from '../types/report-definition.types';
import { monitoring } from '@/infrastructure/monitoring/logger';

function scheduleJobName(reportDefinitionId: string): string {
  return `report-schedule:${reportDefinitionId}`;
}

function buildCron(schedule: ReportScheduleConfig): string {
  switch (schedule.frequency) {
    case 'daily':
      return `0 ${schedule.hourOfDay} * * *`;
    case 'weekly':
      return `0 ${schedule.hourOfDay} * * ${schedule.dayOfWeek ?? 1}`;
    case 'monthly':
      return `0 ${schedule.hourOfDay} ${schedule.dayOfMonth ?? 1} * *`;
  }
}

/**
 * Bridges ReportDefinition.schedule onto the platform's generic
 * CronEngineService/ScheduledJob catalogue (server/scheduler), rather
 * than building a parallel scheduling mechanism. Each scheduled report
 * gets one ScheduledJob (jobType EXPORT_DATA, name
 * "report-schedule:<id>") whose payload carries the report definition
 * id, target format, recipients, and — since ScheduledJob rows are
 * always stored under the pseudo-tenant 'system' — the report's actual
 * tenantId, which ReportExecutionWorker reads back out at run time.
 *
 * Called explicitly by the report-definition controller after
 * create/update/delete rather than from inside ReportBuilderService,
 * to keep the already-shipped report-builder.service.ts untouched.
 */
export class ReportSchedulerService {
  async syncSchedule(definition: ReportDefinition, tenantId: string, userId: string): Promise<void> {
    const jobName = scheduleJobName(definition._id!);
    const existing = await scheduledJobRepository.findByName(jobName);

    if (!definition.schedule?.enabled) {
      if (existing) await cronEngineService.delete(existing._id!, userId);
      return;
    }

    const cron = buildCron(definition.schedule);
    const payload = {
      kind: 'scheduled' as const,
      tenantId,
      reportDefinitionId: definition._id,
      format: definition.schedule.format,
      recipients: definition.schedule.recipients,
    };

    if (existing) {
      await cronEngineService.update(existing._id!, { cron, payload }, userId);
    } else {
      await cronEngineService.create(
        {
          name: jobName,
          description: `Scheduled run for report "${definition.name}"`,
          jobType: JobType.EXPORT_DATA,
          cron,
          payload,
        },
        userId
      );
    }

    monitoring.logInfo(`[ReportScheduler] Synced schedule for report "${definition.name}"`, {
      reportDefinitionId: definition._id,
      cron,
    });
  }

  async removeSchedule(reportDefinitionId: string, userId: string): Promise<void> {
    const jobName = scheduleJobName(reportDefinitionId);
    const existing = await scheduledJobRepository.findByName(jobName);
    if (existing) await cronEngineService.delete(existing._id!, userId);
  }
}

export const reportSchedulerService = new ReportSchedulerService();