// modules/workflows/services/workflow-engine.service.ts

import { Workflow, WorkflowInstance, WorkflowStep, WorkflowStepInstance } from '../types/workflow.types';
import { workflowRepository } from '../repositories/workflow.repository';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';

export class WorkflowEngine {
  async startWorkflow(
    workflowId: string,
    entityId: string,
    entityType: string,
    userId: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const workflow = await workflowRepository.getWorkflow(workflowId, tenantId);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }
    if (workflow.status !== 'active') {
      throw new AppError('Workflow is not active', 'WORKFLOW_INACTIVE', 400);
    }
    if (workflow.steps.length === 0) {
      throw new ValidationError('Workflow has no steps defined');
    }

    const firstStep = workflow.steps[0];

    const instance: Omit<WorkflowInstance, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      workflowId,
      entityId,
      entityType,
      currentStepId: firstStep.id,
      status: 'in_progress',
      steps: workflow.steps.map((step) => ({
        stepId: step.id,
        status: 'pending',
        assignedTo: step.assignee,
        ...(step.id === firstStep.id ? { startedAt: new Date() } : {}),
      })),
      metadata: {},
      createdBy: userId,
      isDeleted: false,
    };

    const created = await workflowRepository.createInstance(instance, tenantId, userId);

    await this.notifyStepAssignees(created._id!, firstStep, tenantId);

    await auditLog.log({
      action: 'WORKFLOW_STARTED',
      userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: created._id,
      metadata: { workflowId, entityId, entityType },
    });

    return created;
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    userId: string,
    comment: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status !== 'pending' && instance.status !== 'in_progress') {
      throw new ConflictError(`Workflow instance is already ${instance.status}`);
    }
    if (instance.currentStepId !== stepId) {
      throw new ConflictError('This step is not the current active step for this workflow');
    }

    const workflow = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
    if (!workflow) {
      throw new NotFoundError('Workflow definition not found');
    }

    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundError('Step definition not found');
    }

    const stepInstance = instance.steps.find((s) => s.stepId === stepId);
    if (!stepInstance) {
      throw new NotFoundError('Step instance not found');
    }
    if (stepInstance.status === 'approved') {
      throw new ConflictError('This step has already been approved');
    }

    if (!this.isAuthorizedForStep(step, stepInstance, userId, workflow)) {
      throw new AppError('You are not authorized to approve this step', 'FORBIDDEN', 403);
    }

    const updatedStepInstance: WorkflowStepInstance = {
      ...stepInstance,
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      comments: comment,
      completedAt: new Date(),
    };

    // Parallel approval support: if the workflow requires all approvals
    // and this step has multiple assignees, check whether every assignee
    // still needs to sign off before actually advancing.
    const requiresAllApprovals = workflow.config?.requireAllApprovals;
    const remainingApprovers = requiresAllApprovals
      ? (step.assignee || []).filter((a) => a !== userId)
      : [];

    const stepFullyApproved = remainingApprovers.length === 0;

    const nextStepId = stepFullyApproved ? (step.nextSteps[0] ?? null) : stepId;
    const nextStatus: WorkflowInstance['status'] = nextStepId ? 'in_progress' : 'approved';

    const result = await workflowRepository.advanceStep(
      instanceId,
      tenantId,
      instance.currentStepId,
      updatedStepInstance,
      stepFullyApproved ? nextStepId : null,
      stepFullyApproved ? nextStatus : instance.status
    );

    if (!result) {
      // The optimistic-concurrency guard tripped: another request already
      // advanced this instance past `instance.currentStepId` since we
      // read it. Surface this as a conflict rather than silently retrying,
      // since blindly retrying could double-apply a side effect like
      // notifying assignees twice.
      throw new ConflictError(
        'This workflow step was already processed by another request. Please refresh and try again.'
      );
    }

    // Stamp startedAt on the newly-current step so processTimeouts measures
    // from when it actually became active, not from instance creation.
    if (stepFullyApproved && nextStepId) {
      const nextStepInstance = result.steps.find((s) => s.stepId === nextStepId);
      if (nextStepInstance && !nextStepInstance.startedAt) {
        await workflowRepository.updateInstanceStep(
          instanceId,
          nextStepId,
          { ...nextStepInstance, startedAt: new Date() },
          tenantId
        );
      }
    }

    await auditLog.log({
      action: 'WORKFLOW_STEP_APPROVED',
      userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { stepId, comment, fullyApproved: stepFullyApproved },
    });

    if (stepFullyApproved) {
      if (nextStepId) {
        const nextStep = workflow.steps.find((s) => s.id === nextStepId);
        if (nextStep) {
          await this.notifyStepAssignees(instanceId, nextStep, tenantId);
        }
      } else {
        await notificationService.sendNotification(instance.createdBy, tenantId, {
          userId: instance.createdBy,
          type: 'system',
          title: 'Workflow Completed',
          message: `Workflow "${workflow.name}" has been completed`,
          priority: 'medium',
          data: { workflowId: workflow._id, entityId: instance.entityId },
          actionUrl: `/${instance.entityType}/${instance.entityId}`,
          actionLabel: 'View',
        });
      }
    }

    return result;
  }

  async rejectStep(
    instanceId: string,
    stepId: string,
    userId: string,
    reason: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status !== 'pending' && instance.status !== 'in_progress') {
      throw new ConflictError(`Workflow instance is already ${instance.status}`);
    }
    if (instance.currentStepId !== stepId) {
      throw new ConflictError('This step is not the current active step for this workflow');
    }

    const stepInstance = instance.steps.find((s) => s.stepId === stepId);
    if (!stepInstance) {
      throw new NotFoundError('Step instance not found');
    }

    const updatedStepInstance: WorkflowStepInstance = {
      ...stepInstance,
      status: 'rejected',
      comments: reason,
      completedAt: new Date(),
    };

    const result = await workflowRepository.advanceStep(
      instanceId,
      tenantId,
      instance.currentStepId,
      updatedStepInstance,
      null,
      'rejected'
    );

    if (!result) {
      throw new ConflictError(
        'This workflow step was already processed by another request. Please refresh and try again.'
      );
    }

    await auditLog.log({
      action: 'WORKFLOW_STEP_REJECTED',
      userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { stepId, reason },
    });

    await notificationService.sendNotification(instance.createdBy, tenantId, {
      userId: instance.createdBy,
      type: 'alert',
      title: 'Workflow Rejected',
      message: `Your request has been rejected: ${reason}`,
      priority: 'high',
      data: { workflowId: instance.workflowId, stepId, reason },
      actionUrl: `/${instance.entityType}/${instance.entityId}`,
      actionLabel: 'View',
    });

    return result;
  }

  async cancelInstance(
    instanceId: string,
    userId: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status === 'approved' || instance.status === 'rejected') {
      throw new ConflictError(`Cannot cancel a workflow that is already ${instance.status}`);
    }

    await workflowRepository.updateInstanceStatus(instanceId, 'cancelled', tenantId);

    await auditLog.log({
      action: 'WORKFLOW_CANCELLED',
      userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { reason },
    });
  }

  /**
   * Scans for in-progress steps that have exceeded their `timeout` (hours)
   * and applies the configured escalation: notifies the configured
   * escalation timeout target (organization owner / fleet manager via
   * the createdBy chain) and marks the step escalated in metadata.
   * Intended to be called by a scheduled job (see Phase 1 Batch 8 scheduler).
   */
  async processTimeouts(tenantId: string): Promise<number> {
    const pending = await workflowRepository.getPendingInstances(tenantId, 500);
    let escalated = 0;

    for (const instance of pending) {
      const workflow = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
      if (!workflow) continue;

      const step = workflow.steps.find((s) => s.id === instance.currentStepId);
      const stepInstance = instance.steps.find((s) => s.stepId === instance.currentStepId);
      if (!step?.timeout || !stepInstance || stepInstance.status !== 'pending') continue;

      const startedAt = stepInstance.startedAt ? new Date(stepInstance.startedAt) : new Date(instance.createdAt!);
      const elapsedHours = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);

      if (elapsedHours >= step.timeout && !instance.metadata?.escalated) {
        await workflowRepository.updateInstance(
          instance._id!,
          { metadata: { ...instance.metadata, escalated: true, escalatedAt: new Date() } },
          tenantId
        );

        await notificationService.sendNotification(instance.createdBy, tenantId, {
          userId: instance.createdBy,
          type: 'alert',
          title: 'Workflow Step Timed Out',
          message: `Step "${step.name}" in workflow "${workflow.name}" has exceeded its ${step.timeout}h timeout`,
          priority: 'high',
          data: { instanceId: instance._id, stepId: step.id },
          actionUrl: `/workflows/${instance._id}`,
          actionLabel: 'Review',
        });

        escalated++;
      }
    }

    return escalated;
  }

  private isAuthorizedForStep(
    step: WorkflowStep,
    stepInstance: WorkflowStepInstance,
    userId: string,
    workflow: Workflow
  ): boolean {
    if (step.assignee && step.assignee.length > 0) {
      const isAssignee = step.assignee.includes(userId);
      const isSelfApproval = stepInstance.assignedTo?.includes(userId) === false;
      if (workflow.config?.allowSelfApproval === false && isSelfApproval) {
        return false;
      }
      return isAssignee;
    }
    // Role-based assignment without an explicit assignee list is permitted
    // through (role resolution against the live user directory happens at
    // the API layer / permission middleware, not inside the engine).
    return true;
  }

  private async notifyStepAssignees(
    instanceId: string,
    step: WorkflowStep,
    tenantId: string
  ): Promise<void> {
    if (step.assignee && step.assignee.length > 0) {
      await notificationService.sendBulkNotification(step.assignee, tenantId, {
        type: 'alert',
        title: 'Action Required',
        message: `Your approval is required for "${step.name}"`,
        priority: 'high',
        data: { instanceId, stepId: step.id },
        actionUrl: `/workflows/${instanceId}`,
        actionLabel: 'Review',
      });
    }
    // step.role-based notification requires resolving role -> user IDs,
    // which depends on the organization member list; left to the caller
    // (controller layer) since the engine itself is tenant/org agnostic.
  }
}

export const workflowEngine = new WorkflowEngine();