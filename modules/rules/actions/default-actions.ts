// modules/rules/actions/default-actions.ts

import { ruleActionRegistry, IRuleActionExecutor } from '../registry/RuleActionRegistry';
import { RuleAction, RuleEvaluationContext } from '../types/rule.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { workflowEngine } from '@/modules/workflows/services/workflow-engine.service';
import { buildWorkflowIdempotencyKey } from '@/modules/workflows/services/workflow-idempotency';

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

    /**
     * PHASE 5 -- rule-driven starts are de-duplicated too.
     *
     * RuleEngineService.fireTrigger re-evaluates on every matching
     * event, so without a key the same rule firing twice for one entity
     * started two approval instances. Keyed on the RULE's id: a repeat
     * firing for the same entity is the duplicate being collapsed, and
     * two DIFFERENT rules starting the same workflow for the same entity
     * remain two legitimate instances.
     */
    const idempotencyKey = context.ruleId
      ? buildWorkflowIdempotencyKey({
          source: 'rule',
          workflowId,
          entityId,
          entityType,
          causeId: String(context.ruleId),
        })
      : null;

    await workflowEngine.startWorkflow(
      workflowId,
      entityId,
      entityType,
      userId || 'system',
      tenantId,
      idempotencyKey
    );
  }
}

/**
 * WAVE 2 (instruction #7 audit finding): `set_variable` was previously
 * registered as a silent no-op, with a comment claiming it was "handled
 * inline by the engine". That claim is false -- RuleEngineService's
 * `evaluate` / `evaluateAndExecute` (rule-engine.service.ts) contain no
 * inline handling for any action type; every action, `set_variable`
 * included, is dispatched exclusively through `ruleActionRegistry`. A
 * rule configured with `set_variable` therefore did nothing at all while
 * `evaluateAndExecute` recorded `{success: true}` for it -- a false
 * "succeeded" signal for an action that had no effect whatsoever.
 *
 * This is exactly the defect class Wave 2 instruction #7 prohibits:
 * "SELECTABLE + SILENTLY NO-OP". Kept registered (so
 * `ruleActionRegistry.isRegistered('set_variable')` still reflects that
 * this is a recognised action name, and the error below is deliberate
 * rather than the registry's generic "did you forget to register an
 * executor" message), but it now fails CLEARLY and OBSERVABLY:
 * `evaluateAndExecute` records `{success: false, error: <this message>}`,
 * which is the correct signal for "this rule needs a different action",
 * not a false success.
 *
 * No rule in this codebase's schemas, seed data, or tests configures
 * `set_variable` today (verified by repository-wide search before this
 * change), so there is no existing behaviour this could regress.
 */
class SetVariableAction implements IRuleActionExecutor {
  async execute(): Promise<void> {
    throw new Error(
      'set_variable is not implemented: no code path in RuleEngineService or any registered ' +
        'executor applies a rule-scoped variable anywhere in this engine. Remove this action from ' +
        'the rule, or use notify / audit_log / publish_event / start_workflow / create_work_order / ' +
        'schedule_maintenance / create_telemetry_alert instead.'
    );
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