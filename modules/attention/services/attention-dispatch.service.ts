// modules/attention/services/attention-dispatch.service.ts
//
// PHASE 6 -- turning an attention item into an operational action.
//
// ---------------------------------------------------------------------
// THE GAP
// ---------------------------------------------------------------------
// The audit's verdict was that intelligence is "analytics-plus-a-ledger,
// not a closed loop": `attention-resolution.service.ts` writes a
// ValueLedgerEntry when a human resolves an item, but nothing ever
// dispatches an operational action. No attention item creates a work
// order, raises a purchase request, schedules maintenance, or starts a
// workflow.
//
// So the platform could tell an operator that a vehicle needed
// attention, and record what resolving it was worth, but the actual
// doing was left entirely to a human retyping it into another screen.
//
// ---------------------------------------------------------------------
// ON THE RULE ACTION REGISTRY, NOT A NEW ENGINE
// ---------------------------------------------------------------------
// `RuleActionRegistry` is already the platform's action seam, and the
// audit was explicit that a third engine must not be added. Its own doc
// comment anticipated exactly this ("lets Phase 5 grow new action types
// later, e.g. create_work_order").
//
// So this service does NOT execute anything itself. It decides WHICH
// action an item warrants and hands it to the registry. That keeps one
// place where an action type is implemented, one place where a new one
// is registered, and no new abstraction competing with the two engines
// that already exist.
//
// ---------------------------------------------------------------------
// IDEMPOTENT, BECAUSE DELIVERY IS AT-LEAST-ONCE
// ---------------------------------------------------------------------
// Attention items are refreshed on a schedule and re-upserted on their
// `itemKey`, and dispatch can be driven by events under Phase 3's
// at-least-once delivery. Without a key, one flagged vehicle would
// accumulate a new work order on every refresh cycle -- a queue of
// duplicate jobs that looks like a much bigger problem than the one
// actually detected.
//
// The key follows the Phase 5 pattern exactly:
//
//     sha256(tenantId ␀ attentionItemKey ␀ actionType ␀ targetEntityId)
//
// backed by a partial unique index on the dispatch record.
//
// ---------------------------------------------------------------------
// WHAT IT DELIBERATELY WILL NOT DO
// ---------------------------------------------------------------------
// It never approves or completes anything. It creates work and starts
// approval chains; a human still decides. An intelligence system that
// could auto-approve its own recommendations would be a system where a
// scoring bug becomes a spend, and the value ledger's whole premise --
// modelled vs REALISED, confirmed by a person -- depends on a person
// being in the loop.

import { createHash } from 'crypto';

import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';
import type { AttentionItem } from '../types/attention-item.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Action types this service will dispatch.
 *
 * A closed set, checked against the registry before use. An attention
 * source that maps to nothing dispatches nothing -- see
 * `actionForSource`, which returns null rather than guessing.
 */
export type AttentionActionType =
  | 'create_work_order'
  | 'create_purchase_request'
  | 'schedule_maintenance'
  | 'start_workflow';

export interface AttentionDispatchRecord {
  tenantId: string;
  orgUnitId?: string;
  attentionItemKey: string;
  actionType: AttentionActionType;
  targetEntityId: string;
  idempotencyKey: string;
  dispatchedAt: Date;
  dispatchedBy: string;
  /** Set when the dispatched action later completed and resolved the item. */
  completedAt?: Date;
  /**
   * BACKLOG ITEM 6 -- set when the executor refused or failed AFTER the
   * record was written.
   *
   * The record is never deleted on failure (record-before-execute is
   * deliberate; see the comment on recordDispatch below), so without
   * these two fields a dispatch record with no work behind it is
   * indistinguishable from one whose work simply has not been linked
   * back yet.
   */
  failedAt?: Date;
  failureReason?: string;
}

export type DispatchOutcome =
  | { status: 'dispatched'; actionType: AttentionActionType; idempotencyKey: string }
  | { status: 'duplicate'; idempotencyKey: string }
  | { status: 'no_action'; reason: string }
  | { status: 'refused'; reason: string };

/**
 * The deterministic dispatch key.
 *
 * NUL-separated for the same reason as every other key in this codebase:
 * naive concatenation makes ('ab','c') and ('a','bc') identical, which
 * would silently merge two different dispatches.
 */
export function buildDispatchIdempotencyKey(params: {
  tenantId: string;
  attentionItemKey: string;
  actionType: string;
  targetEntityId: string;
}): string {
  return createHash('sha256')
    .update(
      [
        params.tenantId,
        params.attentionItemKey,
        params.actionType,
        params.targetEntityId,
      ].join('\u0000')
    )
    .digest('hex');
}

/**
 * Which action an attention source warrants, or null.
 *
 * An EXPLICIT map, not a convention. "Which findings cause the platform
 * to create work" is precisely the question that should require a
 * deliberate edit rather than following automatically from a naming
 * pattern.
 *
 * `fleet_health` is deliberately absent: it produces multi-vehicle
 * recommendations with no single owning entity (the Phase 0 ownership
 * resolver returns null for exactly this reason), so there is no target
 * to create work against.
 *
 * `driver_risk` is deliberately absent too. A risk score about a PERSON
 * is not a maintenance job, and auto-raising anything against an
 * employee on a model's say-so is a decision that needs a human at the
 * front of it, not the end.
 */
export function actionForSource(item: AttentionItem): AttentionActionType | null {
  switch (item.source) {
    case 'predictive_maintenance':
      return 'schedule_maintenance';
    case 'maintenance':
      return 'create_work_order';
    case 'compliance':
      // Compliance findings gate operation and need a documented
      // approval trail, not a silently-created task.
      return 'start_workflow';
    case 'fuel_fraud':
    case 'expense_anomaly':
      // A monetary finding needs investigation and sign-off before any
      // money moves, so it starts an approval chain rather than
      // creating a job.
      return 'start_workflow';
    default:
      return null;
  }
}

export interface DispatchDeps {
  /** Looks up an existing dispatch by key. Injected so this is testable without Mongo. */
  findDispatch(idempotencyKey: string, tenantId: string): Promise<AttentionDispatchRecord | null>;
  /** Records a dispatch. Throws with code 11000 if the key already exists. */
  recordDispatch(record: AttentionDispatchRecord): Promise<void>;
}

export class AttentionDispatchService {
  constructor(private readonly deps: DispatchDeps) {}

  /**
   * Dispatches the action an attention item warrants, once.
   *
   * NEVER THROWS for an expected condition -- a duplicate, an
   * unsupported source, or a missing target all return a structured
   * outcome. The caller is typically an event handler or a scheduled
   * refresh, where throwing would send a poisoned item round the retry
   * loop when the correct response is "not this one, carry on".
   */
  async dispatch(
    item: AttentionItem,
    context: TenantContext,
    userId: string
  ): Promise<DispatchOutcome> {
    const actionType = actionForSource(item);
    if (!actionType) {
      return {
        status: 'no_action',
        reason: `Source '${item.source}' has no dispatchable action.`,
      };
    }

    // Ownership matters as much here as anywhere: an action created
    // against an item whose owning unit we could not resolve would be a
    // job in nobody's queue.
    const targetEntityId = item.entityId;
    if (!targetEntityId) {
      return {
        status: 'no_action',
        reason: 'Attention item identifies no target entity to act on.',
      };
    }

    /**
     * UNSUPPORTED ACTION TYPES FAIL SAFE.
     *
     * Checked against the registry BEFORE recording a dispatch, so an
     * unregistered type cannot leave a dispatch record claiming work was
     * created when nothing was. The registry throws for an unknown type;
     * asking first turns that into a refusal the caller can log.
     */
    if (!ruleActionRegistry.isRegistered(actionType)) {
      return {
        status: 'refused',
        reason:
          `No executor registered for action type '${actionType}'. ` +
          `Registered: ${ruleActionRegistry.registeredTypes().join(', ') || '(none)'}.`,
      };
    }

    const idempotencyKey = buildDispatchIdempotencyKey({
      tenantId: context.organizationId,
      attentionItemKey: item.itemKey,
      actionType,
      targetEntityId,
    });

    const existing = await this.deps.findDispatch(idempotencyKey, context.organizationId);
    if (existing) {
      return { status: 'duplicate', idempotencyKey };
    }

    try {
      /**
       * RECORD BEFORE EXECUTING.
       *
       * Deliberately this order. If the action ran first and the record
       * failed, a redelivery would run the action AGAIN -- creating a
       * second work order. Recording first means the worst case is a
       * dispatch record with no action behind it, which is visible and
       * repairable; the alternative's worst case is duplicate work
       * nobody notices until the queue is full of it.
       */
      await this.deps.recordDispatch({
        tenantId: context.organizationId,
        ...(item.orgUnitId ? { orgUnitId: item.orgUnitId } : {}),
        attentionItemKey: item.itemKey,
        actionType,
        targetEntityId,
        idempotencyKey,
        dispatchedAt: new Date(),
        dispatchedBy: userId,
      });
    } catch (error) {
      // The unique index caught a race: another dispatcher recorded this
      // between our read and this write. That is the index working.
      if ((error as { code?: number }).code === 11000) {
        return { status: 'duplicate', idempotencyKey };
      }
      throw error;
    }

    await ruleActionRegistry.execute(
      {
        type: actionType,
        params: {
          entityId: targetEntityId,
          entityType: item.source,
          attentionItemKey: item.itemKey,
          title: item.title,
          description: item.description,
          severity: item.severity,
          // Carried so the created work inherits the item's own unit
          // rather than the executing process's context.
          orgUnitId: item.orgUnitId,
        },
      } as never,
      {
        entityId: targetEntityId,
        entityType: item.source,
        attentionItemKey: item.itemKey,
        orgUnitId: item.orgUnitId,
      },
      context.organizationId,
      userId
    );

    monitoring.logInfo('[attention-dispatch] Action dispatched', {
      attentionItemKey: item.itemKey,
      actionType,
      targetEntityId,
    });

    return { status: 'dispatched', actionType, idempotencyKey };
  }
}
