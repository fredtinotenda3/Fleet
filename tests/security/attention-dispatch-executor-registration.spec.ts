// tests/security/attention-dispatch-executor-registration.spec.ts
//
// BACKLOG ITEM 6 -- the wiring assertion that stops this feature going
// back to being inert.
//
// THE FAILURE THIS PINS. `registerMaintenanceRuleActions()` is called at
// module scope in rule-engine.service.ts, which is loaded when a
// business RULE runs. A serverless invocation that reaches the dispatch
// endpoint loads the AI controller, the trigger and the registry -- and
// never the engine. With registration only in the engine, the registry
// would be empty on exactly that path, `isRegistered` would return
// false, and every dispatch would refuse with "No executor registered".
//
// That refusal is CORRECT behaviour, which is what makes the bug
// dangerous: nothing errors, nothing logs a fault, and an operator sees
// a polite message where a work order should be. It is the same shape
// as the finding that dispatch had been inert since Phase 6.
//
// So the trigger module registers them itself, and this test asserts
// that importing the trigger ALONE is sufficient. Deliberately imported
// in isolation, with the rule engine never referenced.

import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';

describe('importing the dispatch trigger is enough to make dispatch work', () => {
  it('registers both executors without the rule engine being loaded', () => {
    jest.isolateModules(() => {
      // Fresh registry for this module graph.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ruleActionRegistry: registry } = require('@/modules/rules/registry/RuleActionRegistry');

      // Importing ONLY the trigger -- the path an HTTP dispatch takes.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/modules/attention/services/attention-dispatch.trigger');

      expect(registry.isRegistered('create_work_order')).toBe(true);
      expect(registry.isRegistered('schedule_maintenance')).toBe(true);
      // ROUND 5: actionForSource no longer maps ANY attention source to
      // start_workflow (compliance/fuel_fraud/expense_anomaly used to,
      // and it always failed -- see actionForSource's own comment: no
      // workflow definition ever existed for it to start). start_workflow
      // stays registered as a DEFAULT action regardless, because it is a
      // legitimate, general-purpose action a hand-configured business
      // RULE can still use directly (supplying its own params.workflowId)
      // -- this assertion just confirms the default actions are reachable
      // from the trigger-only import path, independent of attention
      // dispatch's own (now narrower) usage of them.
      expect(registry.isRegistered('start_workflow')).toBe(true);
    });
  });

  it('covers every action type actionForSource can return, plus the general-purpose defaults', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/modules/attention/services/attention-dispatch.trigger');

    // create_work_order/schedule_maintenance are what actionForSource
    // actually returns today. start_workflow is kept in this list
    // because it is still a registered default action (see the comment
    // above), even though no attention source maps to it after ROUND 5.
    for (const type of ['create_work_order', 'schedule_maintenance', 'start_workflow']) {
      expect(ruleActionRegistry.isRegistered(type)).toBe(true);
    }
  });
});
