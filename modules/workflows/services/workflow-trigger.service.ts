// modules/workflows/services/workflow-trigger.service.ts

import { workflowRepository } from '../repositories/workflow.repository';
import { workflowEngine } from './workflow-engine.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { buildWorkflowIdempotencyKey } from './workflow-idempotency';

/**
 * Looks up active workflows configured to trigger on `event`, evaluates
 * each workflow's trigger conditions against the provided context, and
 * starts an instance for every match. This is the integration seam that
 * lets other domains (e.g. ExpenseService on creation, MaintenanceService
 * on overdue) kick off approval workflows without importing workflow
 * internals directly â€” keeping the "no cross-module coupling" goal from
 * the Phase 1 brief intact.
 */
export class WorkflowTriggerService {
  async fireEvent(
    event: string,
    entityId: string,
    entityType: string,
    context: Record<string, unknown>,
    userId: string,
    tenantId: string,
    /**
     * PHASE 5 -- the stable id of the CAUSE, used to build the workflow
     * idempotency key.
     *
     * For an event-driven trigger this is the DomainEvent's `eventId`,
     * which Phase 3 guarantees survives redelivery unchanged: the outbox
     * rehydrates a stored event with its ORIGINAL id rather than
     * generating a new one. That property is what makes de-duplication
     * possible at all -- a fresh id per delivery would dedupe nothing.
     *
     * Optional so a caller with no stable cause (a manual fire) gets no
     * key, and therefore no de-duplication, which is correct for a
     * deliberate repeat.
     */
    causeId?: string
  ): Promise<void> {
    let workflows;
    try {
      workflows = await workflowRepository.getWorkflowsByTrigger(event, tenantId);
    } catch (error) {
      monitoring.logError('Failed to look up workflows for trigger event', error as Error, {
        event,
        tenantId,
      });
      return;
    }

    for (const workflow of workflows) {
      const trigger = workflow.triggers.find((t) => t.event === event);
      if (!trigger) continue;

      if (trigger.conditions && !this.matchesConditions(trigger.conditions, context)) {
        continue;
      }

      try {
        // PHASE 5: the same event redelivered computes the SAME key, so
        // startWorkflow returns the instance the first delivery created
        // instead of raising a second approval for one expense.
        const idempotencyKey = causeId
          ? buildWorkflowIdempotencyKey({
              source: 'event',
              workflowId: workflow._id!,
              entityId,
              entityType,
              causeId,
            })
          : null;

        await workflowEngine.startWorkflow(
          workflow._id!,
          entityId,
          entityType,
          userId,
          tenantId,
          idempotencyKey
        );
      } catch (error) {
        monitoring.logError('Failed to start triggered workflow', error as Error, {
          workflowId: workflow._id,
          event,
          entityId,
        });
      }
    }
  }

  /**
   * Simple flat equality matcher: every key in `conditions` must equal
   * the corresponding value in `context`. Sufficient for the common case
   * (e.g. { amount_gte: 1000 } style conditions would need a small
   * extension here, but exact-match conditions cover the documented
   * trigger examples like { vehicle_type: "Truck" }).
   */
  private matchesConditions(
    conditions: Record<string, unknown>,
    context: Record<string, unknown>
  ): boolean {
    return Object.entries(conditions).every(([key, expected]) => {
      if (key.endsWith('_gte')) {
        const field = key.replace(/_gte$/, '');
        return typeof context[field] === 'number' && (context[field] as number) >= (expected as number);
      }
      if (key.endsWith('_lte')) {
        const field = key.replace(/_lte$/, '');
        return typeof context[field] === 'number' && (context[field] as number) <= (expected as number);
      }
      return context[key] === expected;
    });
  }
}

export const workflowTriggerService = new WorkflowTriggerService();