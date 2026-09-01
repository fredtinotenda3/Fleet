// modules/attention/services/attention-dispatch.trigger.ts
//
// BACKLOG ITEM 6 -- the trigger point, and the scope check in front of
// it.
//
// ---------------------------------------------------------------------
// WHAT THIS ADDS ON TOP OF AttentionDispatchService
// ---------------------------------------------------------------------
// The service decides WHICH action an item warrants and enforces
// idempotency. It takes an `AttentionItem` it is handed and does not
// ask where it came from -- correct for a decision engine, and
// insufficient as an entry point. Between an HTTP request and that
// service, three things have to happen and none of them belong inside
// it:
//
//   1. the item has to be LOADED by key, in the caller's tenant;
//   2. the caller has to be shown to own it, or a branch manager who
//      knows an item key could create work against another branch's
//      vehicle -- the same shape as the Phase G procurement approve
//      bug, but this one creates physical work in a workshop;
//   3. an executor that refuses (unresolvable vehicle, target is
//      already a work order) has to become a structured answer rather
//      than a 500, because those are expected conditions.
//
// ---------------------------------------------------------------------
// WHY A FAILED EXECUTOR DOES NOT DELETE THE DISPATCH RECORD
// ---------------------------------------------------------------------
// The service records the dispatch BEFORE executing, deliberately:
// recording after would mean a redelivery re-runs the action and
// creates a second work order. Keeping that ordering means an executor
// failure leaves a record with no work behind it, and a retry then
// returns `duplicate`.
//
// That is the right way round and it is not silent: the failure is
// written onto the record (`failedAt` / `failureReason`), returned to
// the caller as `action_failed` with the reason, and an operator who
// fixes the underlying data (assign the vehicle, correct the plate) can
// see exactly which record to clear. The alternative -- deleting on
// failure so a retry works -- reintroduces duplicate work whenever the
// "failure" was a timeout on a call that had in fact succeeded.

import { monitoring } from '@/infrastructure/monitoring/logger';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError } from '@/server/errors/app.errors';
import { registerDefaultRuleActions } from '@/modules/rules/actions/default-actions';
import { registerMaintenanceRuleActions } from '@/modules/rules/actions/maintenance-actions';

import { attentionItemRepository } from '../repositories/attention-item.repository';
import { attentionDispatchRepository } from '../repositories/attention-dispatch.repository';
import type { AttentionItem } from '../types/attention-item.types';
import {
  AttentionDispatchService,
  DispatchOutcome,
} from './attention-dispatch.service';
import {
  getAttentionDispatchConfig,
  severityAtLeast,
} from './attention-dispatch.config';

/**
 * Registers the action executors at MODULE SCOPE, the moment anything
 * imports this trigger.
 *
 * NOT optional plumbing -- without it the feature stays inert in exactly
 * the deployment it ships to. `registerMaintenanceRuleActions()` is
 * also called from rule-engine.service.ts, but that module is only
 * loaded when a business RULE runs. A serverless invocation that reaches
 * the dispatch endpoint touches the AI controller, this trigger and the
 * registry -- never the engine -- so the registry would be empty,
 * `isRegistered` would return false, and every dispatch would refuse
 * with "No executor registered".
 *
 * That refusal is correct behaviour and it is precisely how this
 * feature has been silently inert since Phase 6: nothing errors, and an
 * operator sees a polite message instead of a work order.
 *
 * Both calls are idempotent and guarded by their own module-level flag,
 * so the double registration costs nothing. This mirrors
 * ai.controller.ts's module-scope `bootstrapCqrs()`, which exists for
 * the identical reason and whose comment documents the same failure.
 *
 * `registerDefaultRuleActions` is needed too: `actionForSource` maps
 * compliance, fuel_fraud and expense_anomaly to `start_workflow`, which
 * is a DEFAULT action, not one of the two added here.
 */
registerDefaultRuleActions();
registerMaintenanceRuleActions();

export type DispatchTriggerOutcome =
  | DispatchOutcome
  /**
   * The dispatch was recorded and the executor then refused or failed.
   * Distinct from 'refused', which means nothing was recorded.
   */
  | { status: 'action_failed'; idempotencyKey?: string; reason: string };

/**
 * True when this caller may act on this item.
 *
 * Fail-closed on an item with no org unit, matching
 * `assertVehicleInScope`: an unresolvable owner is missing information,
 * not permission. That case is reachable -- `persistFeed` writes
 * `orgUnitId: null` when the owning entity cannot be resolved -- so it
 * is a live branch, not a defensive one.
 */
function itemInScope(item: AttentionItem, context: TenantContext): boolean {
  if (context.accessibleOrgUnitIds === null) return true;
  if (!item.orgUnitId) return false;
  return context.accessibleOrgUnitIds.includes(item.orgUnitId);
}

export class AttentionDispatchTrigger {
  constructor(
    private readonly service: AttentionDispatchService = new AttentionDispatchService(
      attentionDispatchRepository
    )
  ) {}

  /**
   * THE DEFAULT TRIGGER: an operator explicitly asks for this item to
   * be actioned.
   *
   * Throws NotFoundError -- not Forbidden -- for an item outside the
   * caller's scope, the convention established in Phase G: a 403 would
   * confirm the item exists, which tells a caller probing keys
   * something about another branch's findings.
   */
  async dispatchByOperator(
    itemKey: string,
    context: TenantContext,
    userId: string
  ): Promise<DispatchTriggerOutcome> {
    const item = await attentionItemRepository.findByItemKey(context.organizationId, itemKey);
    if (!item || !itemInScope(item, context)) {
      throw new NotFoundError('Attention item not found');
    }

    if (item.status === 'resolved') {
      // Not an error: an operator double-clicking a resolved item wants
      // to be told, not to have a second work order raised.
      return {
        status: 'no_action',
        reason: 'This item is already resolved; dispatching would create work for a closed finding.',
      };
    }

    return this.execute(item, context, userId);
  }

  /**
   * THE OPT-IN TRIGGER: severity-driven, and off unless
   * `ATTENTION_AUTO_DISPATCH_ENABLED=true`.
   *
   * Returns a `no_action` outcome (never throws, never dispatches) when
   * the flag is off or the severity is below the threshold, so a caller
   * wiring this into a refresh cycle gets a loggable answer rather than
   * silence. Both conditions must hold -- see
   * attention-dispatch.config.ts for why severity alone is the only
   * automatic criterion.
   */
  async maybeAutoDispatch(
    item: AttentionItem,
    context: TenantContext,
    userId: string = 'system'
  ): Promise<DispatchTriggerOutcome> {
    const config = getAttentionDispatchConfig();

    if (!config.autoDispatchEnabled) {
      return {
        status: 'no_action',
        reason:
          'Automatic dispatch is disabled (ATTENTION_AUTO_DISPATCH_ENABLED is not "true"). ' +
          'An operator can still dispatch this item explicitly.',
      };
    }

    if (!severityAtLeast(item.severity, config.minAutoSeverity)) {
      return {
        status: 'no_action',
        reason:
          `Severity '${item.severity}' is below the automatic-dispatch threshold ` +
          `'${config.minAutoSeverity}'.`,
      };
    }

    if (item.status === 'resolved') {
      return { status: 'no_action', reason: 'Item is already resolved.' };
    }

    // The same scope rule as the operator path. An automatic dispatch
    // has no user whose scope narrows it, so `context` here is the
    // scope the caller has already established for this item's tenant;
    // the check still refuses an item whose owner is unknown.
    if (!itemInScope(item, context)) {
      return {
        status: 'refused',
        reason:
          'Item has no resolvable owning org unit, so the work it would create would be in ' +
          "nobody's queue.",
      };
    }

    return this.execute(item, context, userId);
  }

  /**
   * Runs the dispatch and converts an executor refusal into an outcome.
   *
   * The executors throw for expected conditions (a plate matching two
   * vehicles, a target that is already a work order). Those are answers,
   * not faults, and a caller on a refresh cycle must not have them
   * bubble up as a 500 that sends the item round a retry loop.
   */
  private async execute(
    item: AttentionItem,
    context: TenantContext,
    userId: string
  ): Promise<DispatchTriggerOutcome> {
    try {
      return await this.service.dispatch(item, context, userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown dispatch failure';

      monitoring.logError('[attention-dispatch] Action execution failed after recording', error as Error, {
        attentionItemKey: item.itemKey,
        tenantId: context.organizationId,
      });

      // Best-effort: the record exists and the operator needs to see
      // why nothing happened. A failure to annotate must not replace
      // the real reason with a second one.
      const idempotencyKey = await this.markFailure(item, context, reason);

      return {
        status: 'action_failed',
        ...(idempotencyKey ? { idempotencyKey } : {}),
        reason,
      };
    }
  }

  private async markFailure(
    item: AttentionItem,
    context: TenantContext,
    reason: string
  ): Promise<string | undefined> {
    try {
      const records = await attentionDispatchRepository.listInScope(
        context,
        { attentionItemKey: item.itemKey },
        1
      );
      const key = records[0]?.idempotencyKey;
      if (!key) return undefined;
      await attentionDispatchRepository.markFailed(key, context.organizationId, reason);
      return key;
    } catch {
      return undefined;
    }
  }
}

export const attentionDispatchTrigger = new AttentionDispatchTrigger();
