// modules/rules/services/rule-engine.service.ts

import {
  Rule,
  RuleCondition,
  RuleConditionGroup,
  RuleConditionTrace,
  RuleEvaluationContext,
  RuleEvaluationResult,
  RuleExecutionResult,
  RuleTestResponse,
  isConditionGroup,
} from '../types/rule.types';
import { ruleRepository } from '../repositories/rule.repository';
import { ruleActionRegistry } from '../registry/RuleActionRegistry';
import { registerDefaultRuleActions } from '../actions/default-actions';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

// Ensure built-in action executors (notify, audit_log, publish_event,
// start_workflow, set_variable) are available the moment this module is
// first imported, mirroring how modules/workflows registers nothing
// extra but relies on its engine being self-contained. Idempotent.
registerDefaultRuleActions();

const MAX_CONDITION_DEPTH = 10;

/** Resolves a dotted-path field (e.g. "vehicle.mileage") against a context object. */
function resolveField(context: RuleEvaluationContext, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, context);
}

function evaluateCondition(condition: RuleCondition, context: RuleEvaluationContext): boolean {
  const actual = resolveField(context, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never);
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return false;
    case 'not_contains':
      if (typeof actual === 'string' && typeof expected === 'string') return !actual.includes(expected);
      if (Array.isArray(actual)) return !actual.includes(expected as never);
      return true;
    case 'starts_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'ends_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    default:
      return false;
  }
}

function evaluateNode(
  node: RuleCondition | RuleConditionGroup,
  context: RuleEvaluationContext,
  trace: RuleConditionTrace[]
): boolean {
  if (isConditionGroup(node)) {
    // Evaluate children first so `trace` reads leaves-before-groups,
    // which is the natural order for a human reviewing "why did this
    // match" top to bottom in the UI.
    const results = node.conditions.map((child) => evaluateNode(child, context, trace));
    const result = node.type === 'AND' ? results.every(Boolean) : results.some(Boolean);
    trace.push({ node, result });
    return result;
  }

  const result = evaluateCondition(node, context);
  trace.push({ node, result });
  return result;
}

function countDepth(group: RuleConditionGroup, depth = 0): number {
  let max = depth;
  for (const node of group.conditions) {
    if (isConditionGroup(node)) {
      max = Math.max(max, countDepth(node, depth + 1));
    }
  }
  return max;
}

export class RuleEngineService {
  /**
   * Evaluates a single rule's condition tree against a context, without
   * executing any actions. Used by both `evaluateAndExecute` and the
   * standalone rule-testing endpoint, so "test this rule against sample
   * data" and "actually run this rule live" can never disagree about
   * whether a rule matches â€” they call the exact same code path.
   */
  evaluate(rule: Rule, rawContext: RuleEvaluationContext): RuleEvaluationResult {
    const context: RuleEvaluationContext = { ...rawContext, ...(rule.variables || {}) };
    const trace: RuleConditionTrace[] = [];
    const matched = evaluateNode(rule.conditions, context, trace);

    return {
      ruleId: rule._id!,
      ruleName: rule.name,
      matched,
      trace,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Evaluates a rule and, if matched, executes every configured action via
   * the RuleActionRegistry. Individual action failures are captured per
   * action rather than aborting the whole rule â€” one misconfigured action
   * (e.g. a bad workflowId) should never prevent the others (e.g. an audit
   * log write) from still happening.
   */
  async evaluateAndExecute(
    rule: Rule,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<RuleExecutionResult> {
    const evaluation = this.evaluate(rule, context);
    const actionsExecuted: RuleExecutionResult['actionsExecuted'] = [];

    if (evaluation.matched) {
      for (const action of rule.actions) {
        try {
          await ruleActionRegistry.execute(action, context, tenantId, userId);
          actionsExecuted.push({ type: action.type, success: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          actionsExecuted.push({ type: action.type, success: false, error: message });
          monitoring.logError(`Rule action "${action.type}" failed for rule "${rule.name}"`, error as Error, {
            ruleId: rule._id,
            tenantId,
          });
        }
      }

      await auditLog.log({
        action: 'RULE_EXECUTED',
        userId: userId || 'system',
        tenantId,
        entityType: 'rule',
        entityId: rule._id,
        metadata: {
          ruleName: rule.name,
          version: rule.version,
          trigger: rule.trigger,
          actionsExecuted,
        },
      });
    }

    return { ...evaluation, actionsExecuted };
  }

  /**
   * Finds all active rules for a given trigger event, evaluates them in
   * priority order (lowest number first), and executes every matching
   * rule's actions. If a matching rule has `stopOnMatch: true`, remaining
   * lower-priority rules for the same trigger are skipped for this pass â€”
   * this is what lets an administrator build an escalating rule chain
   * ("if severe, alert immediately and stop; otherwise fall through to
   * the general logging rule") without every downstream rule also firing.
   */
  async fireTrigger(
    trigger: string,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<RuleExecutionResult[]> {
    const rules = await ruleRepository.getActiveRulesForTrigger(trigger, tenantId);
    const results: RuleExecutionResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateAndExecute(rule, context, tenantId, userId);
      results.push(result);

      if (result.matched && rule.stopOnMatch) {
        break;
      }
    }

    return results;
  }

  /**
   * Dry-run: evaluates a persisted rule against sample data without
   * executing any actions, and reports which actions *would* have run.
   * Backs the "rule testing" requirement so an administrator can validate
   * a rule before flipping it from `draft` to `active`.
   */
  async testRule(
    ruleId: string,
    context: RuleEvaluationContext,
    tenantId: string
  ): Promise<RuleTestResponse> {
    const rule = await ruleRepository.getRule(ruleId, tenantId);
    if (!rule) {
      throw new NotFoundError('Rule not found');
    }

    const evaluation = this.evaluate(rule, context);
    return {
      ...evaluation,
      wouldExecuteActions: evaluation.matched ? rule.actions : [],
    };
  }

  /**
   * Structural validation beyond what zod alone can express: bounds the
   * nesting depth of a condition tree so a pathological rule definition
   * (accidental or malicious) can't degrade evaluation performance or
   * blow the call stack. Called by the controller on create/update.
   */
  validateConditionGroup(group: RuleConditionGroup): void {
    const depth = countDepth(group);
    if (depth > MAX_CONDITION_DEPTH) {
      throw new ValidationError(
        `Rule condition nesting is too deep (${depth} levels, max ${MAX_CONDITION_DEPTH})`
      );
    }
  }
}

export const ruleEngineService = new RuleEngineService();