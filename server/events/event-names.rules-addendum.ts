// server/events/event-names.rules-addendum.ts
//
// Merge these constants into server/events/event-names.ts.

export const RULE_CREATED = 'RuleCreated';
export const RULE_UPDATED = 'RuleUpdated';
export const RULE_DELETED = 'RuleDeleted';
export const RULE_EXECUTED = 'RuleExecuted';

/**
 * RULE_CREATED / RULE_UPDATED / RULE_DELETED are administrative events
 * (a rule definition changed) and should be subscribed onto the same
 * handler list in server/events/bootstrap.ts as every other domain event
 * (audit, analytics, websocket) so rule authoring shows up in the same
 * audit trail and admin activity feed as everything else.
 *
 * RULE_EXECUTED is intentionally NOT auto-published onto the shared event
 * bus by RuleEngineService itself â€” it already writes a RULE_EXECUTED-
 * shaped entry directly via auditLog.log() in evaluateAndExecute(), and
 * auto-publishing a *second* copy as a bus event risks a feedback loop if
 * a rule's own trigger is ever (even transitively) another rule's output
 * event. If a future need arises to react to "any rule executed" via the
 * event bus, publish RULE_EXECUTED explicitly from a call site that has
 * already reasoned about that risk, rather than from inside the engine.
 */