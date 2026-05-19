// infrastructure/queue/queue.service.ts

import { Queue, Worker, Job, QueueScheduler } from 'bullmq';
import Redis from 'ioredis';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export enum JobType {
  PROCESS_REMINDERS = 'process-reminders',
  SEND_NOTIFICATION = 'send-notification',
  GENERATE_REPORT = 'generate-report',
  REFRESH_ANALYTICS = 'refresh-analytics',
  CHECK_OVERDUE = 'check-overdue',
  CLEANUP_LOGS = 'cleanup-logs',
  EXPORT_DATA = 'export-data',
}

export interface JobData {
  type: JobType;
  payload: any;
  tenantId: string;
  userId?: string;
  scheduledFor?: Date;
}

export class QueueService {
  private queues: Map<JobType, Queue> = new Map();
  private workers: Map<JobType, Worker> = new Map();

  initialize() {
    // Initialize queues
    Object.values(JobType).forEach(jobType => {
      const queue = new Queue(jobType, { connection: redisConnection });
      this.queues.set(jobType, queue);
      
      // Initialize worker
      const worker = new Worker(jobType, async (job) => {
        return await this.processJob(jobType, job);
      }, { connection: redisConnection });
      
      this.workers.set(jobType, worker);
      
      worker.on('completed', (job) => {
        console.log(`[Queue] Job ${job.id} completed: ${jobType}`);
        auditLog.info('Job completed', { jobType, jobId: job.id });
      });
      
      worker.on('failed', (job, err) => {
        console.error(`[Queue] Job ${job?.id} failed: ${jobType}`, err);
        auditLog.error('Job failed', { jobType, jobId: job?.id, error: err.message });
      });
    });
    
    console.log('[Queue] Queue service initialized');
  }

  async addJob(jobType: JobType, data: JobData, options?: {
    delay?: number;
    repeat?: { cron: string };
    priority?: number;
  }) {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found: ${jobType}`);
    }
    
    const job = await queue.add(jobType, data, {
      delay: options?.delay,
      repeat: options?.repeat,
      priority: options?.priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    
    console.log(`[Queue] Job added: ${jobType} (${job.id})`);
    return job;
  }

  async addReminderJob(reminder: any, tenantId: string) {
    return this.addJob(JobType.PROCESS_REMINDERS, {
      type: JobType.PROCESS_REMINDERS,
      payload: reminder,
      tenantId,
    }, {
      delay: new Date(reminder.due_date).getTime() - Date.now(),
    });
  }

  async addNotificationJob(userId: string, notification: any, tenantId: string) {
    return this.addJob(JobType.SEND_NOTIFICATION, {
      type: JobType.SEND_NOTIFICATION,
      payload: { userId, notification },
      tenantId,
    });
  }

  async addReportJob(reportConfig: any, tenantId: string, userId: string) {
    return this.addJob(JobType.GENERATE_REPORT, {
      type: JobType.GENERATE_REPORT,
      payload: reportConfig,
      tenantId,
      userId,
    });
  }

  async scheduleAnalyticsRefresh(tenantId: string) {
    return this.addJob(JobType.REFRESH_ANALYTICS, {
      type: JobType.REFRESH_ANALYTICS,
      payload: {},
      tenantId,
    }, {
      repeat: { cron: '0 */6 * * *' }, // Every 6 hours
    });
  }

  async scheduleOverdueCheck() {
    return this.addJob(JobType.CHECK_OVERDUE, {
      type: JobType.CHECK_OVERDUE,
      payload: {},
      tenantId: 'system',
    }, {
      repeat: { cron: '0 8 * * *' }, // Daily at 8 AM
    });
  }

  private async processJob(jobType: JobType, job: Job) {
    const { payload, tenantId } = job.data;
    
    switch (jobType) {
      case JobType.PROCESS_REMINDERS:
        await this.processReminder(payload, tenantId);
        break;
      case JobType.SEND_NOTIFICATION:
        await this.sendNotification(payload);
        break;
      case JobType.GENERATE_REPORT:
        await this.generateReport(payload);
        break;
      case JobType.REFRESH_ANALYTICS:
        await this.refreshAnalytics(tenantId);
        break;
      case JobType.CHECK_OVERDUE:
        await this.checkOverdueReminders();
        break;
      case JobType.CLEANUP_LOGS:
        await this.cleanupLogs();
        break;
      case JobType.EXPORT_DATA:
        await this.exportData(payload);
        break;
    }
  }

  private async processReminder(reminder: any, tenantId: string) {
    // Implementation: Send notifications, create follow-up jobs
    console.log(`[Queue] Processing reminder: ${reminder._id}`);
  }

  private async sendNotification(payload: any) {
    console.log(`[Queue] Sending notification to user: ${payload.userId}`);
  }

  private async generateReport(payload: any) {
    console.log(`[Queue] Generating report: ${payload.type}`);
  }

  private async refreshAnalytics(tenantId: string) {
    console.log(`[Queue] Refreshing analytics for tenant: ${tenantId}`);
  }

  private async checkOverdueReminders() {
    console.log('[Queue] Checking overdue reminders');
  }

  private async cleanupLogs() {
    console.log('[Queue] Cleaning up old logs');
  }

  private async exportData(payload: any) {
    console.log(`[Queue] Exporting data: ${payload.type}`);
  }

  async shutdown() {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    await redisConnection.quit();
  }
}

export const queueService = new QueueService();