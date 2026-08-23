import { workflowEngine, WorkflowActor } from '@/modules/workflows/services/workflow-engine.service';
import { WorkflowInstance } from '@/modules/workflows/types/workflow.types';
import { metricsRegistry } from './metrics.registry';
import { withSpan } from './tracer';

/**
 * Thin metrics-recording wrapper around the WorkflowEngine singleton.
 * Kept separate from modules/workflows/services/workflow-engine.service.ts
 * so that file stays untouched; each method records duration/outcome
 * metrics and delegates the actual state transition unchanged.
 */
class ObservableWorkflowEngine {
  async startWorkflow(
    workflowId: string,
    entityId: string,
    entityType: string,
    userId: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    return withSpan(
      'workflow.start',
      async () => {
        const instance = await workflowEngine.startWorkflow(workflowId, entityId, entityType, userId, tenantId);
        metricsRegistry.workflowInstancesTotal.inc({ workflowId, status: 'started' });
        metricsRegistry.workflowActiveInstances.inc({ workflowId });
        return instance;
      },
      { 'workflow.id': workflowId, 'entity.type': entityType }
    );
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    // PHASE 0, F-4: carries the actor's ROLES through the observability
    // layer unchanged. A decorator that narrowed this back to a bare
    // userId would silently disarm the engine's role-assigned-step check
    // for every caller that goes through the wrapper -- which is every
    // HTTP caller, since the controller imports this and not the engine.
    actor: WorkflowActor,
    comment: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const start = Date.now();
    return withSpan(
      'workflow.approve_step',
      async () => {
        const result = await workflowEngine.approveStep(instanceId, stepId, actor, comment, tenantId);
        metricsRegistry.workflowStepDuration.observe(
          { workflowId: result.workflowId, action: 'approve' },
          (Date.now() - start) / 1000
        );
        if (result.status === 'approved') {
          metricsRegistry.workflowInstancesTotal.inc({ workflowId: result.workflowId, status: 'approved' });
          metricsRegistry.workflowActiveInstances.dec({ workflowId: result.workflowId });
        }
        return result;
      },
      { 'workflow.instance_id': instanceId, 'workflow.step_id': stepId }
    );
  }

  async rejectStep(
    instanceId: string,
    stepId: string,
    actor: WorkflowActor,
    reason: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const start = Date.now();
    return withSpan(
      'workflow.reject_step',
      async () => {
        const result = await workflowEngine.rejectStep(instanceId, stepId, actor, reason, tenantId);
        metricsRegistry.workflowStepDuration.observe(
          { workflowId: result.workflowId, action: 'reject' },
          (Date.now() - start) / 1000
        );
        metricsRegistry.workflowInstancesTotal.inc({ workflowId: result.workflowId, status: 'rejected' });
        metricsRegistry.workflowActiveInstances.dec({ workflowId: result.workflowId });
        return result;
      },
      { 'workflow.instance_id': instanceId, 'workflow.step_id': stepId }
    );
  }

  async cancelInstance(instanceId: string, actor: WorkflowActor, tenantId: string, reason?: string): Promise<void> {
    return withSpan(
      'workflow.cancel',
      async () => {
        await workflowEngine.cancelInstance(instanceId, actor, tenantId, reason);
      },
      { 'workflow.instance_id': instanceId }
    );
  }

  async processTimeouts(tenantId: string): Promise<number> {
    return withSpan('workflow.process_timeouts', () => workflowEngine.processTimeouts(tenantId));
  }
}

export const observableWorkflowEngine = new ObservableWorkflowEngine();