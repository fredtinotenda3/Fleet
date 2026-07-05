// modules/rules/actions/default-actions.ts

import { ruleActionRegistry, IRuleActionExecutor } from '../registry/RuleActionRegistry';
import { RuleAction, RuleEvaluationContext } from '../types/rule.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { workflowEngine } from '@/modules/workflows/services/workflow-engine.service';

/**
 * Publishes an arbitrary domain event onto the existing event bus. This is
 * the most general-purpose built-in action: any handler already subscribed
 * via server/events/bootstrap.ts (workflow triggers, notifications,
 * analytics, intelligence, websocket, audit) will react to it exactly as
 * it would to any other domain event, so a business rule can effectively
 * "inject" a new event into Phase 3's pipeline without the rules module
 * needing bespoke integration with each downstream handler.
 */
class PublishEventAction implements IRuleActionExecutor {
  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const eventName = String(action.params.eventName || 'RuleActionTriggered');
    const bus = EventBusFactory.getInstance();

    await bus.publish(
      new (class extends DomainEvent {
        constructor() {
          super(
            eventName,
            { ...action.params, context },
            { tenantId, userId, source: 'rule_engine' }
          );
        }
      })()
    );
  }
}

class NotifyAction implements IRuleActionExecutor {
  async execute(action: RuleAction, context: RuleEvaluationContext, tenantId: string): Promise<void> {
    const userIds = (action.params.userIds as string[]) || [];
    if (userIds.length === 0) return;

    await notificationService.sendBulkNotification(userIds, tenantId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: (action.params.notificationType as any) || 'alert',
      title: String(action.params.title || 'Business rule triggered'),
      message: String(action.params.message || ''),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      priority: (action.params.priority as any) || 'medium',
      data: { context },
      actionUrl: action.params.actionUrl as string | undefined,
      actionLabel: action.params.actionLabel as string | undefined,
    });
  }
}

class AuditLogAction implements IRuleActionExecutor {
  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    await auditLog.log({
      action: String(action.params.auditAction || 'RULE_ACTION'),
      userId: userId || 'system',
      tenantId,
      entityType: (action.params.entityType as string) || 'rule',
      entityId: (action.params.entityId as string) || (context.entityId as string | undefined),
      metadata: { context, params: action.params },
    });
  }
}

class StartWorkflowAction implements IRuleActionExecutor {
  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const workflowId = String(action.params.workflowId || '');
    if (!workflowId) {
      throw new Error('start_workflow action requires params.workflowId');
    }

    const entityId = String(action.params.entityId || context.entityId || '');
    const entityType = String(action.params.entityType || context.entityType || 'rule_context');

    await workflowEngine.startWorkflow(workflowId, entityId, entityType, userId || 'system', tenantId);
  }
}

/**
 * `set_variable` actions only affect the in-memory evaluation trace that
 * RuleEngineService builds while walking a rule's condition/action list
 * (e.g. surfacing a computed value for the next action in the same rule
 * to reference) and are interpreted there directly. Registering a no-op
 * here keeps `ruleActionRegistry.isRegistered('set_variable')` truthful
 * for rules that declare this action type, rather than throwing at
 * execution time for an action the engine already understands natively.
 */
class SetVariableAction implements IRuleActionExecutor {
  async execute(): Promise<void> {
    /* handled inline by the engine; intentionally a no-op here */
  }
}

let registered = false;

export function registerDefaultRuleActions(): void {
  if (registered) return;
  registered = true;

  ruleActionRegistry.register('publish_event', new PublishEventAction());
  ruleActionRegistry.register('notify', new NotifyAction());
  ruleActionRegistry.register('audit_log', new AuditLogAction());
  ruleActionRegistry.register('start_workflow', new StartWorkflowAction());
  ruleActionRegistry.register('set_variable', new SetVariableAction());
}