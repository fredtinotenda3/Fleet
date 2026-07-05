// modules/workflows/controllers/workflow.controller.ts

import { NextRequest } from 'next/server';
import { observableWorkflowEngine as workflowEngine } from '@/infrastructure/observability/workflow-observer';
import { workflowRepository } from '../repositories/workflow.repository';
import {
  workflowCreateSchema,
  workflowUpdateSchema,
  workflowStartSchema,
  workflowApproveSchema,
  workflowRejectSchema,
} from '@/shared/validations/workflow.schema';
import {
  successResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { Workflow } from '../types/workflow.types';

export class WorkflowController {
  // ── Definitions ──────────────────────────────────────────────────────

  async listWorkflows(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const activeOnly = req.nextUrl.searchParams.get('activeOnly') !== 'false';
      const workflows = await workflowRepository.getWorkflows(tenantId, activeOnly);
      return successResponse(workflows);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getWorkflow(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const workflow = await workflowRepository.getWorkflow(id, tenantId);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }
      return successResponse(workflow);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createWorkflow(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = workflowCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid workflow definition', parsed.error.flatten());
      }

      // Workflow (via BaseEntity) requires tenantId, which the create
      // schema deliberately excludes since it's derived server-side.
      const workflow = await workflowRepository.createWorkflow(
        { ...parsed.data, tenantId } as Omit<Workflow, '_id' | 'createdAt' | 'updatedAt'>,
        tenantId,
        userId
      );
      return createdResponse(workflow);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateWorkflow(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = workflowUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid workflow update', parsed.error.flatten());
      }

      const workflow = await workflowRepository.updateWorkflow(id, parsed.data, tenantId, userId);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }
      return successResponse(workflow);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteWorkflow(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const deleted = await workflowRepository.deleteWorkflow(id, tenantId, userId);
      if (!deleted) {
        throw new NotFoundError('Workflow not found');
      }
      return successResponse({ message: 'Workflow deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMetrics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
      const metrics = await workflowRepository.getWorkflowMetrics(tenantId, days);
      return successResponse(metrics);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ── Instances ────────────────────────────────────────────────────────

  async startWorkflow(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = workflowStartSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.flatten());
      }

      const instance = await workflowEngine.startWorkflow(
        parsed.data.workflowId,
        parsed.data.entityId,
        parsed.data.entityType,
        userId,
        tenantId
      );
      return createdResponse(instance);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getInstance(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const instance = await workflowRepository.getInstance(id, tenantId);
      if (!instance) {
        throw new NotFoundError('Workflow instance not found');
      }
      return successResponse(instance);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getInstancesForEntity(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const entityId = req.nextUrl.searchParams.get('entityId');
      const entityType = req.nextUrl.searchParams.get('entityType');

      if (!entityId || !entityType) {
        throw new ValidationError('entityId and entityType query params are required');
      }

      const instances = await workflowRepository.getInstancesByEntity(entityId, entityType, tenantId);
      return successResponse(instances);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMyTasks(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const instances = await workflowRepository.getInstancesByAssignee(userId, tenantId);
      return successResponse(instances);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async approveStep(req: NextRequest, instanceId: string, stepId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json().catch(() => ({}));

      const parsed = workflowApproveSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.flatten());
      }

      const instance = await workflowEngine.approveStep(
        instanceId,
        stepId,
        userId,
        parsed.data.comment,
        tenantId
      );
      return successResponse(instance);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rejectStep(req: NextRequest, instanceId: string, stepId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = workflowRejectSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.flatten());
      }

      const instance = await workflowEngine.rejectStep(
        instanceId,
        stepId,
        userId,
        parsed.data.reason,
        tenantId
      );
      return successResponse(instance);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelInstance(req: NextRequest, instanceId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json().catch(() => ({}));

      await workflowEngine.cancelInstance(instanceId, userId, tenantId, body?.reason);
      return successResponse({ message: 'Workflow cancelled' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[WorkflowController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const workflowController = new WorkflowController();