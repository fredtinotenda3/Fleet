// modules/workflows/services/workflow-engine.service.ts

import { Workflow, WorkflowInstance, WorkflowStep } from '../types/workflow.types';
import { workflowRepository } from '../repositories/workflow.repository';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class WorkflowEngine {
  async startWorkflow(workflowId: string, entityId: string, entityType: string, userId: string, tenantId: string): Promise<WorkflowInstance> {
    const workflow = await workflowRepository.getWorkflow(workflowId, tenantId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    
    const firstStep = workflow.steps[0];
    
    const instance: Omit<WorkflowInstance, '_id' | 'createdAt' | 'updatedAt'> = {
      workflowId,
      entityId,
      entityType,
      currentStepId: firstStep.id,
      status: 'pending',
      steps: workflow.steps.map(step => ({
        stepId: step.id,
        status: step.id === firstStep.id ? 'pending' : 'pending',
        assignedTo: step.assignee,
      })),
      metadata: {},
      createdBy: userId,
      tenantId,
      isDeleted: false,
    };
    
    const result = await workflowRepository.createInstance(instance, tenantId, userId);
    
    await this.processStep(result._id!, firstStep, userId, tenantId);
    
    await auditLog.logAction('WORKFLOW_STARTED', userId, tenantId, {
      workflowId,
      entityId,
      entityType,
    });
    
    return result;
  }
  
  async approveStep(instanceId: string, stepId: string, userId: string, comment: string, tenantId: string): Promise<void> {
    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new Error('Workflow instance not found');
    }
    
    const workflow = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error('Step not found');
    }
    
    const stepInstance = instance.steps.find(s => s.stepId === stepId);
    if (!stepInstance) {
      throw new Error('Step instance not found');
    }
    
    // Update step status
    stepInstance.status = 'approved';
    stepInstance.approvedBy = userId;
    stepInstance.approvedAt = new Date();
    stepInstance.comments = comment;
    
    // Find next steps
    const nextSteps = step.nextSteps;
    
    if (nextSteps.length === 0) {
      // Workflow completed
      await workflowRepository.completeInstance(instanceId, tenantId);
      
      await notificationService.sendNotification(userId, tenantId, {
        userId,
        type: 'system',
        title: 'Workflow Completed',
        message: `Workflow ${workflow.name} has been completed`,
        priority: 'medium',
        data: { workflowId: workflow._id, entityId: instance.entityId },
        actionUrl: `/${instance.entityType}/${instance.entityId}`,
        actionLabel: 'View',
      });
    } else {
      // Move to next step
      const nextStepId = nextSteps[0];
      const nextStep = workflow.steps.find(s => s.id === nextStepId);
      
      instance.currentStepId = nextStepId;
      await workflowRepository.updateInstance(instanceId, { currentStepId: nextStepId }, tenantId);
      
      await this.processStep(instanceId, nextStep!, userId, tenantId);
    }
    
    await workflowRepository.updateInstanceStep(instanceId, stepId, stepInstance, tenantId);
    
    await auditLog.logAction('WORKFLOW_STEP_APPROVED', userId, tenantId, {
      instanceId,
      stepId,
      comment,
      instance,
    });
  }
  
  async rejectStep(instanceId: string, stepId: string, userId: string, reason: string, tenantId: string): Promise<void> {
    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new Error('Workflow instance not found');
    }
    
    const stepInstance = instance.steps.find(s => s.stepId === stepId);
    if (!stepInstance) {
      throw new Error('Step instance not found');
    }
    
    stepInstance.status = 'rejected';
    stepInstance.comments = reason;
    
    await workflowRepository.updateInstanceStatus(instanceId, 'rejected', tenantId);
    await workflowRepository.updateInstanceStep(instanceId, stepId, stepInstance, tenantId);
    
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
    
    await auditLog.logAction('WORKFLOW_STEP_REJECTED', userId, tenantId, {
      instanceId,
      stepId,
      reason,
    });
  }
  
  private async processStep(instanceId: string, step: WorkflowStep, userId: string, tenantId: string): Promise<void> {
    // Send notifications to assignees
    if (step.assignee && step.assignee.length > 0) {
      for (const assignee of step.assignee) {
        await notificationService.sendNotification(assignee, tenantId, {
          userId: assignee,
          type: 'alert',
          title: 'Action Required',
          message: `Your approval is required for ${step.name}`,
          priority: 'high',
          data: { instanceId, stepId: step.id },
          actionUrl: `/workflows/${instanceId}`,
          actionLabel: 'Review',
        });
      }
    } else if (step.role) {
      // TODO: Get users with role and notify them
    }
  }
}

export const workflowEngine = new WorkflowEngine();