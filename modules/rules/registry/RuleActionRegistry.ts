// modules/rules/registry/RuleActionRegistry.ts

import { RuleAction, RuleEvaluationContext } from '../types/rule.types';

export interface IRuleActionExecutor {
  execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void>;
}

/**
 * Pluggable registry mapping an action `type` string to the executor that
 * carries it out. This keeps the rules module decoupled from every domain
 * it might act upon (maintenance, notifications, workflows, billing, ...):
 * other modules register their own executors at bootstrap time instead of
 * the rule engine importing each domain module directly. This mirrors how
 * server/events/bootstrap.ts wires domain event handlers onto the event
 * bus without those handlers living inside server/events itself, and lets
 * Phase 5 grow new action types later (e.g. "create_work_order",
 * "reserve_parts" once inventory exists) without editing the engine.
 *
 * Registered on `globalThis` for the same reason CommandBus/QueryBus are:
 * Next.js dev-mode module reloads must not wipe out registrations that
 * happened during a previous bootstrap pass.
 */
class RuleActionRegistry {
  private readonly executors = new Map<string, IRuleActionExecutor>();

  register(type: string, executor: IRuleActionExecutor): void {
    this.executors.set(type, executor);
  }

  isRegistered(type: string): boolean {
    return this.executors.has(type);
  }

  registeredTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const executor = this.executors.get(action.type);
    if (!executor) {
      throw new Error(
        `[RuleActionRegistry] No executor registered for action type "${action.type}". ` +
          `Did you forget to call registerDefaultRuleActions() or register a custom executor?`
      );
    }
    await executor.execute(action, context, tenantId, userId);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _ruleActionRegistry: RuleActionRegistry | undefined;
}

export const ruleActionRegistry: RuleActionRegistry =
  global._ruleActionRegistry ?? (global._ruleActionRegistry = new RuleActionRegistry());