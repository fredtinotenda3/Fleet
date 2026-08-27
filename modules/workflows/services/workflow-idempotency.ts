// modules/workflows/services/workflow-idempotency.ts
//
// PHASE 5 -- stopping at-least-once delivery from starting two approvals.
//
// ---------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------
// Phase 3 made event delivery at-least-once, and stated plainly that
// three handlers were not idempotent. `WorkflowTriggerHandler` was the
// sharpest of them: `startWorkflow` had no dedupe key at all, so a
// redelivered event (the outbox processor crashing between dispatch and
// completion, then reclaiming the row after its lease expired) started a
// SECOND approval instance for the same expense.
//
// The consequence is not a duplicate row. It is two managers asked to
// approve the same thing, two audit trails for one decision, and --
// because `updateInstanceStatus` writes by instance id -- whichever is
// approved second silently leaves the first in-flight forever, or
// overwrites its outcome depending on which path runs.
//
// The same hole existed in rule firing: `RuleEngineService.fireTrigger`
// re-evaluates on every matching event, and its `start_workflow` action
// went through the same unguarded `startWorkflow`.
//
// ---------------------------------------------------------------------
// WHY DETERMINISTIC AND NOT A UUID
// ---------------------------------------------------------------------
// A UUID generated at start time is a new value on every retry, so it
// deduplicates nothing. The key must be a FUNCTION OF THE CAUSE, so that
// the same cause computes the same key on every attempt, in every
// process, after any restart.
//
// The cause is: this trigger source + this event + this workflow
// definition + this entity. Two different expenses produce different
// keys; the same expense redelivered produces the same key; and a HUMAN
// starting the same workflow twice produces no key at all, because that
// is a legitimate second request rather than a duplicate delivery.
//
// ---------------------------------------------------------------------
// WHY HASHED
// ---------------------------------------------------------------------
// The raw components include a workflow id, an entity id and an event
// id, which can exceed MongoDB's ~1024-byte index key limit when
// concatenated -- and an index that silently rejects long keys would
// fail exactly on the longest, least-common cases. A SHA-256 hex digest
// is fixed-width, collision-resistant far beyond what this needs, and
// safe as an index key.
//
// The `source` prefix is left readable so an operator inspecting a
// stuck instance can tell an event-driven start from a rule-driven one
// without decoding anything.

import { createHash } from 'crypto';

/** What caused this workflow to start. */
export type WorkflowTriggerSource =
  /** A domain event delivered through the outbox. */
  | 'event'
  /** A rule action (`start_workflow`). */
  | 'rule'
  /** A human clicking start. Deliberately never given a key. */
  | 'manual';

export interface WorkflowIdempotencyInput {
  source: WorkflowTriggerSource;
  workflowId: string;
  entityId: string;
  entityType: string;
  /**
   * The specific cause instance.
   *
   * For `event`, the DomainEvent's `eventId` -- which Phase 3 already
   * guarantees is stable across redelivery, because the outbox
   * rehydrates a stored event with its ORIGINAL id rather than
   * generating a new one. That property is what makes this work at all.
   *
   * For `rule`, the rule's id: a rule firing twice for the same entity
   * is the duplicate we are collapsing.
   */
  causeId: string;
}

/**
 * The deterministic key, or `null` for a manual start.
 *
 * Returning `null` for `manual` is deliberate rather than an oversight:
 * a person who raises two purchase approvals for the same vehicle on
 * purpose must get two workflows. Suppressing the second would look like
 * the button was broken, and the failure would be silent. Automated
 * starts have no such ambiguity -- a repeat is always a duplicate.
 */
export function buildWorkflowIdempotencyKey(
  input: WorkflowIdempotencyInput
): string | null {
  if (input.source === 'manual') return null;

  if (!input.workflowId || !input.entityId || !input.causeId) {
    // A key missing a component would collapse unrelated starts. Better
    // to have no key -- and therefore no de-duplication -- than a key
    // that suppresses a legitimate, different workflow.
    return null;
  }

  const digest = createHash('sha256')
    .update(
      [input.source, input.workflowId, input.entityType, input.entityId, input.causeId].join('\u0000')
    )
    .digest('hex');

  // NUL-separated above so that ('ab', 'c') and ('a', 'bc') cannot
  // produce the same digest -- a real collision class with naive
  // concatenation, and one that would silently merge two different
  // workflows.
  return `${input.source}:${digest}`;
}
