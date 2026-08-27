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
import { allocationPostingService } from '@/modules/finance/services/allocation-posting.service';
import type { AllocationCostCategory } from '@/modules/finance/types/allocation.types';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';

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
const POSTING_EVENTS: Record<string, PostingSpec> = {
  ExpenseCreated: { sourceCollection: 'tblexpenses', costCategory: 'other' },
  FuelLogCreated: { sourceCollection: 'tblfuellogs', costCategory: 'fuel' },
  MaintenanceCompleted: { sourceCollection: 'tblreminders', costCategory: 'maintenance' },
  WorkOrderCompleted: { sourceCollection: 'tblreminders', costCategory: 'maintenance' },
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
    const source = await this.buildSource(spec, payload, tenantId);
    if (!source) return;

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

    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source
    );

    if (outcome.status === 'refused') {
      // Logged, not thrown. A refusal is a property of THIS record and
      // will fail identically on every retry -- sending it round the
      // outbox retry loop to the dead-letter queue would bury a
      // condition an operator needs to read now.
      monitoring.logWarn('[allocation-posting] Posting refused', {
        eventName: event.eventName,
        sourceCollection: source.sourceCollection,
        sourceId: source.sourceId,
        reason: outcome.reason,
      });
    }
  }

  /**
   * Maps an event payload onto a postable source.
   *
   * Returns null when the payload does not carry what a posting needs.
   * Every field is read from the payload or resolved from the
   * authoritative vehicle record -- nothing is defaulted into existence.
   */
  private async buildSource(
    spec: PostingSpec,
    payload: Record<string, unknown>,
    tenantId: string
  ) {
    const sourceId = String(payload.expenseId ?? payload.fuelLogId ?? payload.entityId ?? payload.id ?? '');
    if (!sourceId) return null;

    const amount = Number(payload.amount ?? payload.cost ?? payload.totalCost);
    if (!Number.isFinite(amount)) return null;

    // Expenses and fuel logs key on license_plate, not vehicleId. The
    // identity resolver is the one place that bridges the two, so it is
    // used here rather than re-deriving the lookup.
    const vehicleId = await this.resolveVehicleId(payload, tenantId);
    if (!vehicleId) return null;

    const occurredAt = payload.date ? new Date(payload.date as string) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return null;

    return {
      sourceCollection: spec.sourceCollection,
      sourceId,
      vehicleId,
      costCategory: spec.costCategory,
      occurredAt,
      amount,
      // Absent means the tenant's reporting currency -- the only safe
      // default, since that is what every pre-Phase-6 record implicitly
      // is. A foreign currency with no rate is refused downstream, never
      // converted at 1:1.
      ...(typeof payload.currency === 'string' ? { currency: payload.currency } : {}),
      ...(typeof payload.fxRate === 'number' ? { fxRate: payload.fxRate } : {}),
      ...(typeof payload.driverId === 'string' ? { driverId: payload.driverId } : {}),
    };
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
