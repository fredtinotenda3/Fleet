// server/scheduler/job-scheduler.controller.ts

import { NextRequest } from 'next/server';
import { cronEngineService } from './cron-engine.service';
import { deadLetterService } from '@/infrastructure/queue/dead-letter.service';
import { queueService } from '@/infrastructure/queue/queue.service';
import { QUEUE_DEFINITIONS } from '@/infrastructure/queue/queue-definitions';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getUserIdFromRequest } from '@/server/utils/context.utils';

export class JobSchedulerController {
  async listSchedules(_req: NextRequest) {
    try {
      const schedules = await cronEngineService.list();
      return successResponse(schedules);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createSchedule(req: NextRequest) {
    try {
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      if (!body.name || !body.jobType || !body.cron) {
        throw new ValidationError('name, jobType, and cron are required');
      }
      const created = await cronEngineService.create(body, userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateSchedule(req: NextRequest, id: string) {
    try {
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const updated = await cronEngineService.update(id, body, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async pauseSchedule(req: NextRequest, id: string) {
    try {
      const userId = await getUserIdFromRequest(req);
      const updated = await cronEngineService.pause(id, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resumeSchedule(req: NextRequest, id: string) {
    try {
      const userId = await getUserIdFromRequest(req);
      const updated = await cronEngineService.resume(id, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteSchedule(req: NextRequest, id: string) {
    try {
      const userId = await getUserIdFromRequest(req);
      await cronEngineService.delete(id, userId);
      return successResponse({ message: 'Scheduled job deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getQueueStats(_req: NextRequest) {
    try {
      const stats: Record<string, unknown> = {};
      for (const queueName of Object.keys(QUEUE_DEFINITIONS)) {
        stats[queueName] = await queueService.getQueueCounts(queueName);
      }
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listDeadLetters(_req: NextRequest) {
    try {
      const entries = await deadLetterService.listUnresolved('system', 100);
      return successResponse(entries);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveDeadLetter(req: NextRequest, id: string) {
    try {
      const userId = await getUserIdFromRequest(req);
      const updated = await deadLetterService.resolve(id, 'system', userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async retryJob(req: NextRequest) {
    try {
      const body = await req.json();
      if (!body.queueName || !body.jobId) {
        throw new ValidationError('queueName and jobId are required');
      }
      const retried = await queueService.retryJob(body.queueName, body.jobId);
      return successResponse({ retried });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[JobSchedulerController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const jobSchedulerController = new JobSchedulerController();