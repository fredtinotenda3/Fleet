// modules/rules/services/rule-trigger.service.ts

import { ruleEngineService } from './rule-engine.service';
import { RuleEvaluationContext, RuleExecutionResult } from '../types/rule.types';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Thin, failure-isolated entry point other domain modules call to fire a
 * rule trigger (e.g. VehicleCommandService calling this after an odometer
 * update, or MaintenanceCommandService calling it after a reminder is
 * created). Mirrors modules/workflows/services/workflow-trigger.service.ts's
 * role for workflows: callers never need to know whether any rules exist
 * for a given trigger name, and a rule-engine failure must never fail the
 * caller's own write operation â€” a business rule misfiring should degrade
 * to "nothing happened, logged" rather than "the vehicle update failed".
 */
export class RuleTriggerService {
  async fireEvent(
    trigger: string,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<RuleExecutionResult[]> {
    try {
      return await ruleEngineService.fireTrigger(trigger, context, tenantId, userId);
    } catch (error) {
      monitoring.logError('Rule engine failed to process trigger', error as Error, {
        trigger,
        tenantId,
      });
      return [];
    }
  }
}

export const ruleTriggerService = new RuleTriggerService();