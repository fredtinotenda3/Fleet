// tests/unit/rules/set-variable-explicit-failure.spec.ts
//
// WAVE 2 (instruction #7 audit finding) -- `set_variable` was registered
// as a silent no-op whose own comment falsely claimed the engine handled
// it inline. Verified by reading RuleEngineService.evaluate/
// evaluateAndExecute in full: there is no inline handling for ANY action
// type anywhere in that file -- every action is dispatched exclusively
// through RuleActionRegistry. A rule using `set_variable` therefore did
// nothing at all while reporting `{success: true}`.
//
// This suite pins the fix at both levels: the executor itself throws,
// and -- more importantly -- the full evaluateAndExecute path records
// the failure rather than a false success, which is the actual
// user-visible contract ("IMPLEMENTED OR EXPLICITLY UNSUPPORTED, never
// SELECTABLE + SILENTLY NO-OP").

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));
jest.mock('@/modules/rules/repositories/rule.repository', () => ({
  ruleRepository: { getActiveRulesForTrigger: jest.fn(), getRule: jest.fn() },
}));

import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';
import { registerDefaultRuleActions } from '@/modules/rules/actions/default-actions';
import { ruleEngineService } from '@/modules/rules/services/rule-engine.service';
import type { Rule } from '@/modules/rules/types/rule.types';

beforeAll(() => {
  registerDefaultRuleActions();
});

describe('set_variable executor', () => {
  it('is still a recognised action name (isRegistered stays true)', () => {
    expect(ruleActionRegistry.isRegistered('set_variable')).toBe(true);
  });

  it('throws, rather than silently succeeding, when executed directly', async () => {
    await expect(
      ruleActionRegistry.execute({ type: 'set_variable', params: {} }, {}, 'tenant-1')
    ).rejects.toThrow(/set_variable is not implemented/);
  });
});

describe('a rule configured with set_variable, evaluated end-to-end', () => {
  function rule(): Rule {
    return {
      _id: 'rule-1',
      name: 'Legacy rule using set_variable',
      category: 'test',
      trigger: 'vehicle.updated',
      conditions: { type: 'AND', conditions: [{ field: 'x', operator: 'eq', value: 1 }] },
      actions: [{ type: 'set_variable', params: { name: 'y', value: 2 } }],
      priority: 10,
      status: 'active',
      version: 1,
      tenantId: 'tenant-1',
    } as unknown as Rule;
  }

  it('reports {success: false} with a clear reason, not a false success', async () => {
    const result = await ruleEngineService.evaluateAndExecute(rule(), { x: 1 }, 'tenant-1');

    expect(result.matched).toBe(true);
    expect(result.actionsExecuted).toHaveLength(1);
    expect(result.actionsExecuted[0]).toMatchObject({ type: 'set_variable', success: false });
    expect(result.actionsExecuted[0].error).toMatch(/set_variable is not implemented/);
  });
});
