// server/events/handlers/finance/AllocationPostingHandler.ts
//
// PHASE 6 -- the event handler that fills the allocation ledger.
//
// ---------------------------------------------------------------------
// WHY A HANDLER AND NOT A CALL INSIDE EACH SERVICE
// ---------------------------------------------------------------------
// Posting could have been a line inside CreateExpenseHandler,
// CreateFuelLogHandler and so on. It is a subscriber instead, for three
// reasons that matter here specifically:
//
//   1. IT MUST NOT FAIL THE WRITE. An expense that saves but does not
//      post is a recoverable accounting gap; an expense that FAILS TO
//      SAVE because the ledger rejected it is lost operational data. As
//      a subscriber, a posting failure cannot roll back the transaction
//      that caused it.
//
//   2. PHASE 3 ALREADY GIVES IT DURABILITY. Under outbox mode the event
//      is persisted before dispatch, so a posting that fails is retried
//      with backoff and dead-lettered rather than silently skipped --
//      which is exactly the guarantee a financial posting needs, and
//      exactly what an inline call would NOT have.
//
//   3. IT KEEPS FINANCE OUT OF THE OPERATIONAL MODULES. Expenses should
//      not import the ledger. The audit's F-14 lesson generalises: a
//      module that reaches into another's write path is how coupling
//      grows back.
//
// ---------------------------------------------------------------------
// AT-LEAST-ONCE IS ASSUMED, NOT HOPED FOR
// ---------------------------------------------------------------------
// Phase 3 states plainly that delivery is at-least-once. This handler is
// therefore idempotent BY CONSTRUCTION rather than by luck:
// allocationPostingService derives a deterministic key from the source
// record and a partial unique index enforces it. A redelivered event
// returns `duplicate` and writes nothing.
//
// That property is load-bearing because the ledger is APPEND-ONLY: a
// double posting cannot be edited away, only reversed by a human who
// first notices a number that looks plausible.

import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';
import {
  allocationPostingService,
  type AutoPostSource,
} from '@/modules/finance/services/allocation-posting.service';
import type { AllocationCostCategory } from '@/modules/finance/types/allocation.types';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';
import {
  EXPENSE_CREATED,
  FUEL_LOGGED,
  REMINDER_COMPLETED,
  WORK_ORDER_COMPLETED,
} from '@/server/events/event-names';

/** What each subscribed event contributes to the ledger. */
interface PostingSpec {
  sourceCollection: AllocationPosting['sourceCollection'];
  costCategory: AllocationCostCategory;
}

/**
 * Events that produce a financial posting.
 *
 * An explicit map rather than a naming convention: a convention would
 * silently start posting the moment somebody named a new event
 * `SomethingCreated`, and "which events move money" is precisely the
 * question that should require a deliberate edit.
 */
/**
 * TWO OF THESE FOUR NAMES DID NOT EXIST.
 *
 * The map shipped as:
 *
 *   ExpenseCreated       -- real
 *   FuelLogCreated       -- NOT AN EVENT. The published name is `FuelLogged`.
 *   MaintenanceCompleted -- NOT AN EVENT. The published name is `ReminderCompleted`.
 *   WorkOrderCompleted   -- real, but filed under sourceCollection 'tblreminders'
 *
 * So the ledger received EXPENSES ONLY. Fuel -- the largest operating
 * cost in almost any fleet -- never posted, and neither did maintenance.
 * `getCostPerKm` therefore divided a real distance by a total that was
 * missing most of its numerator, and returned a number that looked like
 * an answer.
 *
 * This is the same defect class as AIPredictionTriggerHandler reading a
 * `payload.vehicleId` no event ever set: a handler correctly written,
 * correctly subscribed, and keyed on names nothing publishes. Nothing
 * throws, nothing logs, and the only symptom is a total that is too low
 * -- which is indistinguishable from a quiet month.
 *
 * The names are now taken from server/events/event-names.ts constants
 * rather than written as string literals, so a rename cannot silently
 * un-wire them again. `allocation-posting-wiring.spec.ts` asserts every
 * key here is a registered, published event name.
 */
const POSTING_EVENTS: Record<string, PostingSpec> = {
  [EXPENSE_CREATED]: { sourceCollection: 'tblexpenses', costCategory: 'expense' },
  [FUEL_LOGGED]: { sourceCollection: 'tblfuellogs', costCategory: 'fuel' },
  [REMINDER_COMPLETED]: { sourceCollection: 'tblreminders', costCategory: 'maintenance' },
  [WORK_ORDER_COMPLETED]: { sourceCollection: 'tblworkorders', costCategory: 'maintenance' },
};

export class AllocationPostingHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const spec = POSTING_EVENTS[event.eventName];
    if (!spec) return;

    const tenantId = event.metadata?.tenantId as string | undefined;
    if (!tenantId) {
      // No tenant means no scope, and a posting without scope would be
      // invisible to every scoped reader while still counting toward
      // totals. Refused rather than guessed.
      monitoring.logWarn('[allocation-posting] Event carries no tenant; skipping', {
        eventName: event.eventName,
        eventId: event.eventId,
      });
      return;
    }

    const payload = event.payload as Record<string, unknown>;
    /**
     * A single event can produce SEVERAL postings. A completed work
     * order is two costs -- parts consumed from inventory, and labour --
     * which a finance team accounts for separately and which
     * `totalCost` alone makes unrecoverable. The posting idempotency key
     * includes costCategory, so the two never collide.
     */
    const sources = await this.buildSources(spec, payload, tenantId);
    if (sources.length === 0) return;

    /**
     * A PLATFORM context: this handler runs from a worker with no acting
     * user, so it has organization-wide visibility by necessity.
     *
     * That does NOT weaken org-unit isolation. The posting's own
     * `orgUnitId` is derived by allocationService from the resolved
     * VEHICLE record, exactly as it is for a human-initiated posting --
     * the handler supplies no org unit and has no field in which to
     * express one.
     */
    const context = {
      organizationId: tenantId,
      organizationName: '',
      // null = organization-wide, the convention TenantContext uses
      // everywhere. Required here because a worker has no acting user
      // and must be able to post for any unit -- and constrained by the
      // fact that the POSTING's own orgUnitId comes from the vehicle,
      // which this handler cannot influence.
      accessibleOrgUnitIds: null,
      assignedOrgUnitIds: [],
      isPlatformScope: false,
    } as unknown as import('@/modules/tenancy/services/tenant-context.service').TenantContext;

    for (const source of sources) {
      const outcome = await allocationPostingService.postSource(context, 'system', source);

      if (outcome.status === 'refused') {
        // Logged, not thrown. A refusal is a property of THIS record and
        // will fail identically on every retry -- sending it round the
        // outbox retry loop to the dead-letter queue would bury a
        // condition an operator needs to read now.
        monitoring.logWarn('[allocation-posting] Posting refused', {
          eventName: event.eventName,
          sourceCollection: source.sourceCollection,
          sourceId: source.sourceId,
          costCategory: source.costCategory,
          reason: outcome.reason,
        });
      }
    }
  }

  /**
   * Maps an event payload onto a postable source.
   *
   * Returns null when the payload does not carry what a posting needs.
   * Every field is read from the payload or resolved from the
   * authoritative vehicle record -- nothing is defaulted into existence.
   */
  private async buildSources(
    spec: PostingSpec,
    payload: Record<string, unknown>,
    tenantId: string
  ): Promise<AutoPostSource[]> {
    const sourceId = String(payload.expenseId ?? payload.fuelLogId ?? payload.entityId ?? payload.id ?? '');
    if (!sourceId) return [];

    // Expenses and fuel logs key on license_plate, not vehicleId. The
    // identity resolver is the one place that bridges the two, so it is
    // used here rather than re-deriving the lookup.
    const vehicleId = await this.resolveVehicleId(payload, tenantId);
    if (!vehicleId) return [];

    /**
     * THE POSTING PERIOD IS THE RECORD'S OWN DATE.
     *
     * This previously read `payload.date ? ... : new Date()`, and NO
     * event carried a `date` -- so every posting was dated to the moment
     * the handler happened to run. A fuel log entered today for last
     * month's refuel posted into this month, silently moving cost
     * between accounting periods. Since the ledger is append-only, that
     * is not correctable by an edit.
     *
     * The events now carry their record's date (see FuelLoggedEvent,
     * ReminderCompletedEvent, WorkOrderCompletedEvent). When it is still
     * absent the posting is REFUSED rather than dated to now: a cost in
     * the wrong period is a reconciliation failure that surfaces months
     * later, whereas a refusal is visible today and re-postable once the
     * source record is corrected.
     */
    const rawDate = payload.date ?? payload.completion_date ?? payload.completedAt;
    if (!rawDate) {
      monitoring.logWarn('[allocation-posting] Source carries no date; refusing to post', {
        sourceCollection: spec.sourceCollection,
        sourceId,
      });
      return [];
    }
    const occurredAt = new Date(rawDate as string);
    if (Number.isNaN(occurredAt.getTime())) return [];

    const common = {
      sourceId,
      vehicleId,
      occurredAt,
      // Absent means the tenant's reporting currency -- the only safe
      // default, since that is what every pre-Phase-6 record implicitly
      // is. A foreign currency with no rate is refused downstream, never
      // converted at 1:1.
      ...(typeof payload.currency === 'string' ? { currency: payload.currency } : {}),
      ...(typeof payload.fxRate === 'number' ? { fxRate: payload.fxRate } : {}),
      ...(typeof payload.driverId === 'string' ? { driverId: payload.driverId } : {}),
    };

    // ── work orders: parts and labour are separate costs ────────────
    if (spec.sourceCollection === 'tblworkorders') {
      const parts = Number(payload.partsCost);
      const labour = Number(payload.laborCost);
      const out: AutoPostSource[] = [];

      if (Number.isFinite(parts) && parts > 0) {
        out.push({
          ...common,
          sourceCollection: spec.sourceCollection,
          costCategory: 'maintenance' as AllocationCostCategory,
          amount: parts,
          description: 'Work order parts',
        });
      }
      if (Number.isFinite(labour) && labour > 0) {
        out.push({
          ...common,
          sourceCollection: spec.sourceCollection,
          costCategory: 'other' as AllocationCostCategory,
          amount: labour,
          description: 'Work order labour',
        });
      }

      /**
       * Fall back to totalCost ONLY when neither component is present.
       * Posting the total ALONGSIDE the components would double-count
       * the work order, which on an append-only ledger needs a human
       * reversal to undo.
       */
      if (out.length === 0) {
        const total = Number(payload.totalCost);
        if (Number.isFinite(total) && total > 0) {
          out.push({
            ...common,
            sourceCollection: spec.sourceCollection,
            costCategory: spec.costCategory,
            amount: total,
            description: 'Work order total (parts/labour split unavailable)',
          });
        }
      }
      return out;
    }

    const amount = Number(payload.amount ?? payload.cost ?? payload.totalCost);
    if (!Number.isFinite(amount)) return [];

    return [
      {
        ...common,
        sourceCollection: spec.sourceCollection,
        costCategory: spec.costCategory,
        amount,
        /**
         * Reminder costs are ESTIMATES -- Reminder carries no actuals
         * field (see the audit note in maintenance.types.ts). Saying so
         * on the posting keeps a finance user from reconciling an
         * estimate against an invoice and concluding the ledger is wrong.
         */
        ...(payload.cost_is_estimate === true
          ? { description: 'Maintenance (estimated cost -- no actuals recorded)' }
          : {}),
      },
    ];
  }

  private async resolveVehicleId(
    payload: Record<string, unknown>,
    tenantId: string
  ): Promise<string | null> {
    if (typeof payload.vehicleId === 'string' && payload.vehicleId) {
      return payload.vehicleId;
    }

    const plate = payload.license_plate;
    if (typeof plate !== 'string' || !plate) return null;

    const { vehicleRepository } = await import(
      '@/modules/vehicles/repositories/vehicle.repository'
    );
    const vehicle = await vehicleRepository.findByLicensePlate(plate, tenantId);
    return vehicle?._id ?? null;
  }
}

export const allocationPostingHandler = new AllocationPostingHandler();
