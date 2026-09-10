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
import {
  buildAllocationSources,
  type PostingSpec,
} from '@/modules/finance/services/allocation-source-builder';
import {
  EXPENSE_CREATED,
  FUEL_LOGGED,
  REMINDER_COMPLETED,
  WORK_ORDER_COMPLETED,
} from '@/server/events/event-names';

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
export const POSTING_EVENTS: Record<string, PostingSpec> = {
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
   * Maps an event payload onto postable sources.
   *
   * The RULES live in allocation-source-builder.ts, shared with the
   * historical backfill script. They were a private method here until
   * the backfill needed to produce byte-identical postings from the same
   * records read out of the database rather than off an event -- and two
   * implementations of one posting rule is how a ledger ends up holding
   * two answers for the same month.
   *
   * What stays here is the part that is genuinely event-specific: where
   * the source id lives on a payload, and resolving the vehicle.
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

    const { sources, refusal } = buildAllocationSources({
      spec,
      sourceId,
      vehicleId,
      record: payload,
    });

    if (refusal) {
      // Logged rather than thrown: a refusal is a property of THIS
      // record and will fail identically on every retry, so sending it
      // round the outbox retry loop to the dead-letter queue would bury
      // a condition an operator needs to read now.
      monitoring.logWarn('[allocation-posting] Nothing posted for this source', {
        sourceCollection: spec.sourceCollection,
        sourceId,
        reason: refusal,
      });
    }

    return sources;
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

/**
 * The event names this handler must be subscribed to.
 *
 * EXPORTED because the map above being right is not sufficient -- the
 * handler also has to RECEIVE those events, and it did not.
 *
 * server/events/bootstrap.ts subscribed it inside a loop over a
 * hand-written `allEventNames` array whose own comment claimed it was
 * "every event". `WorkOrderCompleted` was not in it. So after the
 * previous round corrected three of the four keys in POSTING_EVENTS,
 * the fourth was still unreachable: every part consumed and every
 * labour hour on every completed work order stayed out of the ledger,
 * and cost-per-km divided real distance by a numerator missing the
 * entire workshop.
 *
 * This is the FOURTH instance of the same family in this codebase, and
 * the first one where fixing the previous instance created it -- the map
 * was corrected, the subscription list was not, and nothing connected
 * the two. Deriving the subscription from the map is what makes them one
 * fact instead of two that must agree by hand.
 */
export const POSTING_EVENT_NAMES = Object.keys(POSTING_EVENTS);

export const allocationPostingHandler = new AllocationPostingHandler();
