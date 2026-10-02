// modules/dispatch/services/dispatch.service.ts
import { dispatchRepository, DispatchRepository } from '../repositories/dispatch.repository';
import { DispatchJob, DispatchJobCreateDTO, DispatchFilters, DispatchJobStatus } from '../types/dispatch.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  DispatchJobCreatedEvent,
  DispatchJobAssignedEvent,
  DispatchJobStartedEvent,
  DispatchJobCompletedEvent,
  DispatchJobCancelledEvent,
  DispatchJobTripLinkedEvent,
} from '../events/dispatch.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { driverWriteResolver } from '@/modules/drivers/services/driver-write-resolver.service';
import { customerRepository } from '@/modules/transport-cost/repositories/customer.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import type { Trip } from '@/shared/types/trip.types';

const VALID_TRANSITIONS: Record<DispatchJobStatus, DispatchJobStatus[]> = {
  unassigned: ['assigned', 'cancelled'],
  assigned: ['en_route', 'cancelled'],
  en_route: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Dispatch job statuses from which a Trip may be attached (either
 * direction -- see assertCanLinkTrip). Deliberately NOT the same thing
 * as VALID_TRANSITIONS: starting or discovering a trip is not itself a
 * manual status change a dispatcher requests through
 * PUT /api/dispatch/:id/status, it is a side effect of real operational
 * evidence (a trip record) showing up. 'unassigned' is excluded because
 * there is no vehicle/driver yet for a trip to belong to; 'completed'
 * and 'cancelled' are excluded because the job is already closed.
 */
const TRIP_LINKABLE_STATUSES: DispatchJobStatus[] = ['assigned', 'en_route', 'in_progress'];

export class DispatchService {
  constructor(private readonly repo: DispatchRepository = dispatchRepository) {}

  /**
   * ROUND 4 FIX -- the exact same class of gap already fixed in
   * WorkOrderService (see that service's own "ORG-UNIT SCOPE ON EVERY
   * BY-ID OPERATION" comment). `create` resolved a full TenantContext;
   * every other dispatch operation (list/board/get/assign/changeStatus)
   * resolved only a bare tenantId and never checked org-unit scope at
   * all -- so a Fleet Manager scoped to one branch could list, read,
   * assign and complete every OTHER branch's dispatch jobs too, despite
   * DispatchRepository already having the scoped queries
   * (getFilteredInScope/getActiveBoardInScope) sitting unused. NOT-FOUND
   * rather than FORBIDDEN, for the same disclosure reason WorkOrder's
   * version documents.
   */
  private assertInScope(job: DispatchJob, context: TenantContext): void {
    if (!tenantScopeService.canAccessRecord(context, job.orgUnitId)) {
      throw new NotFoundError('Dispatch job not found');
    }
  }

  async create(data: DispatchJobCreateDTO, scope: WriteScope, userId: string): Promise<DispatchJob> {
    const tenantId = tenantIdOf(scope);
    if (!data.title?.trim()) throw new ValidationError('title is required');
    if (!data.pickupLocation?.trim()) throw new ValidationError('pickupLocation is required');

    // Real master data, validated rather than trusted blind -- a
    // caller-supplied id that does not resolve in this tenant would
    // otherwise silently attach a dangling/foreign reference. Customer
    // is organization-level (no org-unit scoping of its own; see
    // customer.types.ts), so a tenant check is the whole of it.
    if (data.customerId) {
      const customer = await customerRepository.findById(data.customerId, tenantId);
      if (!customer) throw new ValidationError('customerId does not match an existing customer');
    }

    const orgUnitId =
      scope.kind === 'user' ? resolveCreationOrgUnitId(scope.context, data.orgUnitId) : undefined;

    const created = await this.repo.create(
      {
        ...(orgUnitId ? { orgUnitId } : {}),
        title: data.title,
        priority: data.priority || 'medium',
        status: 'unassigned',
        pickupLocation: data.pickupLocation,
        dropoffLocation: data.dropoffLocation,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
        notes: data.notes,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        ...(data.jobReference?.trim() ? { jobReference: data.jobReference.trim() } : {}),
      } as Omit<DispatchJob, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'>,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  /**
   * ROUND 4 FIX. `assign` previously took a bare `tenantId` and did
   * nothing to confirm `driverId`/`vehicleId` actually exist, belong to
   * this tenant, or are within the caller's org-unit scope -- a
   * scope-narrowed dispatcher could assign a vehicle or driver from
   * another branch (or a stale/mistyped id) and the job would then
   * silently vanish from the assigning branch's own scoped board while
   * attributing the vehicle/driver's activity to a unit they do not
   * manage. `vehicleWriteResolver`/`driverWriteResolver` are the exact
   * seams the rest of this codebase already uses for this -- reused
   * here rather than re-implemented (see those services' own headers
   * for the fail-closed, indistinguishable-not-found contract).
   */
  async assign(id: string, driverId: string, vehicleId: string, scope: WriteScope, userId: string): Promise<DispatchJob> {
    const tenantId = tenantIdOf(scope);
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dispatch job not found');
    if (scope.kind === 'user') this.assertInScope(existing, scope.context);
    this.assertTransition(existing.status, 'assigned');

    // Cross-vehicle / cross-driver / cross-branch validation: resolving
    // under the caller's own write scope refuses a foreign-tenant,
    // out-of-scope, or non-existent id identically (see the resolvers'
    // own docs for why that indistinguishability matters).
    const vehicle = await vehicleWriteResolver.resolveByIdForWrite(vehicleId, scope);
    const driver = await driverWriteResolver.resolveForWrite(driverId, scope);

    // Double-booking guard is deliberately TENANT-wide, not narrowed to
    // the caller's own org-unit scope: the same vehicle/driver could be
    // double-booked by two different branches' dispatchers, and that is
    // exactly the conflict this check exists to catch. Narrowing it
    // would hide the one case it matters most for.
    const activeJobs = await this.repo.getActiveBoard(tenantId);
    const conflict = activeJobs.find(
      (j) => j._id !== id && (j.assignedDriverId === driver._id || j.assignedVehicleId === vehicle._id)
    );
    if (conflict) throw new ConflictError('Driver or vehicle is already assigned to another active dispatch job');

    const updated = await this.repo.update(
      id,
      { status: 'assigned' as DispatchJobStatus, assignedDriverId: driver._id, assignedVehicleId: vehicle._id, assignedAt: new Date() },
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Dispatch job not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobAssignedEvent(updated, { tenantId, userId }));

    return updated;
  }

  async changeStatus(id: string, status: DispatchJobStatus, scope: WriteScope, userId: string, reason?: string): Promise<DispatchJob> {
    const tenantId = tenantIdOf(scope);
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dispatch job not found');
    if (scope.kind === 'user') this.assertInScope(existing, scope.context);
    this.assertTransition(existing.status, status);

    const updates: Partial<DispatchJob> = { status };
    if (status === 'in_progress' && !existing.startedAt) updates.startedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();
    if (status === 'cancelled') updates.cancelledReason = reason;

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Dispatch job not found');

    const bus = EventBusFactory.getInstance();
    if (status === 'in_progress') await bus.publish(new DispatchJobStartedEvent(updated, { tenantId, userId }));
    if (status === 'completed') {
      await bus.publish(new DispatchJobCompletedEvent(updated, { tenantId, userId }));
      await auditLog.log({ action: 'DISPATCH_JOB_COMPLETED', userId, tenantId, entityType: 'dispatch_job', entityId: id });
    }
    if (status === 'cancelled') await bus.publish(new DispatchJobCancelledEvent(updated, { tenantId, userId }));

    return updated;
  }

  /**
   * ORG-WIDE. Retained for the one caller that genuinely needs every
   * unit regardless of the current request's scope: needsAttentionService
   * falls back to this when it has no TenantContext at all (mirrors
   * ComplianceService.list/WorkOrderService.list's identical fallback
   * role). A request-driven caller uses `listInScope`.
   */
  async list(filters: DispatchFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<DispatchJob>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  /** What the API serves -- org-unit-scoped, using the repository method that existed but was never called from here. */
  async listInScope(filters: DispatchFilters, pagination: PaginationParams, context: TenantContext): Promise<PaginatedResponse<DispatchJob>> {
    return this.repo.getFilteredInScope(filters, context, pagination);
  }

  async get(id: string, context: TenantContext): Promise<DispatchJob> {
    const job = await this.repo.findById(id, context.organizationId);
    if (!job) throw new NotFoundError('Dispatch job not found');
    this.assertInScope(job, context);
    return job;
  }

  /** ORG-WIDE board. See `list`'s doc comment -- same system-caller rationale. */
  async getBoard(tenantId: string): Promise<DispatchJob[]> {
    return this.repo.getActiveBoard(tenantId);
  }

  /** What the Dispatch Board page serves -- org-unit-scoped. */
  async getBoardInScope(context: TenantContext): Promise<DispatchJob[]> {
    return this.repo.getActiveBoardInScope(context);
  }

  /**
   * ROUND 4 (Dispatch <-> Trip core requirement).
   *
   * Validates that `id` may have a Trip attached right now, under
   * `scope`. Used BOTH as a pre-check (so CreateTripHandler can fail
   * before creating an orphaned trip when the dispatch side is invalid)
   * and, re-run, as the actual guard inside the two commit methods
   * below -- one implementation, so the two call sites can never drift
   * apart on what "linkable" means.
   *
   * @throws NotFoundError the job does not exist, or exists outside
   *   `scope`'s tenant/org-unit boundary (never distinguished from
   *   not-found, for the same reason every other by-id lookup in this
   *   codebase keeps the two indistinguishable).
   * @throws ConflictError the job already has a different trip linked
   *   (duplicate-association guard), or its status is not one of
   *   TRIP_LINKABLE_STATUSES.
   */
  async assertCanLinkTrip(id: string, scope: WriteScope): Promise<DispatchJob> {
    const tenantId = tenantIdOf(scope);
    const job = await this.repo.findById(id, tenantId);
    if (!job) throw new NotFoundError('Dispatch job not found');
    if (scope.kind === 'user') this.assertInScope(job, scope.context);

    if (job.tripId) {
      throw new ConflictError('Dispatch job is already linked to a trip');
    }
    if (!TRIP_LINKABLE_STATUSES.includes(job.status)) {
      throw new ConflictError(`Cannot link a trip to a dispatch job in status "${job.status}"`);
    }
    return job;
  }

  /**
   * DISPATCH -> TRIP direction. Called by CreateTripHandler immediately
   * after it persists a new Trip created with this job's
   * `dispatchJobId`. Re-validates via assertCanLinkTrip (closes the
   * race between the handler's pre-check and this commit) and advances
   * the job to 'in_progress' directly -- a trip actually starting IS
   * the work being underway, whether or not this fleet tracks an
   * intermediate 'en_route' state (most no-telemetry fleets do not: see
   * the Harare ABC123 acceptance scenario, where nobody is available to
   * flip a status the moment a vehicle pulls out). This is a distinct,
   * narrower transition rule from VALID_TRANSITIONS/changeStatus
   * (TRIP_LINKABLE_STATUSES, checked above) specifically so the generic
   * manual status endpoint does not gain a new assigned -> in_progress
   * jump as a side effect of this one.
   */
  async attachCreatedTrip(id: string, tripId: string, scope: WriteScope, userId?: string): Promise<DispatchJob> {
    const job = await this.assertCanLinkTrip(id, scope);
    const tenantId = tenantIdOf(scope);

    const updates: Partial<DispatchJob> = { tripId, status: 'in_progress' };
    if (!job.startedAt) updates.startedAt = new Date();

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Dispatch job not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobStartedEvent(updated, { tenantId, userId }));

    return updated;
  }

  /**
   * TRIP -> DISPATCH direction. Associates an EXISTING trip (logged
   * independently -- e.g. the no-GPS fleet records its trip once the
   * run is over rather than live) with a dispatch job after the fact.
   *
   * Validates the trip side with the same rigor the dispatch side gets:
   * the trip must exist, belong to the same tenant, and sit within the
   * caller's org-unit scope (mirrors assertInScope, applied to
   * Trip.orgUnitId); and it must not already be linked to a DIFFERENT
   * dispatch job (the duplicate-association guard from the trip's
   * side -- assertCanLinkTrip only guards the dispatch side).
   *
   * Status is advanced from the trip's own recorded status where that
   * is an unambiguous signal (completed -> completed, ongoing ->
   * in_progress) and left untouched otherwise ('planned'/'cancelled'
   * trips say nothing reliable about whether THIS job's work happened).
   * This is read off a transition table already in this class
   * (VALID_TRANSITIONS, via assertTransition) rather than a second,
   * parallel status rule -- an inapplicable derived transition is
   * silently skipped rather than thrown, since the caller asked to link
   * a trip, not to force a status change.
   */
  async linkExistingTrip(id: string, tripId: string, scope: WriteScope, userId: string): Promise<DispatchJob> {
    const job = await this.assertCanLinkTrip(id, scope);
    const tenantId = tenantIdOf(scope);

    const trip = await tripRepository.findById(tripId, tenantId);
    if (!trip) throw new NotFoundError('Trip not found');
    if (scope.kind === 'user' && !tenantScopeService.canAccessRecord(scope.context, trip.orgUnitId)) {
      throw new NotFoundError('Trip not found');
    }
    if (trip.dispatchJobId && trip.dispatchJobId !== id) {
      throw new ConflictError('Trip is already linked to a different dispatch job');
    }

    const updates: Partial<DispatchJob> = { tripId };
    const derivedStatus = this.deriveStatusFromTrip(trip);
    if (derivedStatus && derivedStatus !== job.status) {
      try {
        this.assertTransition(job.status, derivedStatus);
        updates.status = derivedStatus;
        if (derivedStatus === 'in_progress' && !job.startedAt) updates.startedAt = new Date();
        if (derivedStatus === 'completed') updates.completedAt = new Date();
      } catch {
        // Not a reachable transition from the job's current status (e.g.
        // already past it) -- link the trip without forcing a status
        // change rather than failing the whole request over a derived
        // convenience.
      }
    }

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Dispatch job not found');

    // Trip.dispatchJobId is the other half of this link. Not a Mongo
    // multi-document transaction (none exist in this codebase -- see
    // AllocationPostingService for the established sequential,
    // best-effort convention this follows); the dispatch side committed
    // first and is the authority a retry would reconcile against.
    await tripRepository.update(tripId, { dispatchJobId: id } as Partial<Trip>, tenantId, userId);

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobTripLinkedEvent(updated, { tenantId, userId }));

    return updated;
  }

  private deriveStatusFromTrip(trip: Trip): DispatchJobStatus | null {
    if (trip.status === 'completed') return 'completed';
    if (trip.status === 'ongoing') return 'in_progress';
    return null;
  }

  /**
   * Honest cost summary for this dispatch job. Never fabricates a
   * figure: with no trip linked yet, cost is explicitly unknown rather
   * than zero (zero would read as "this job cost nothing"). Once a
   * trip is linked, the cost is the SAME linked-cost computation Trip
   * Cost Analytics already uses (fuel + expenses actually linked to
   * that trip via tripId -- see trip.repository.ts's cost-analytics
   * aggregation), not a re-derived or estimated number.
   */
  async getCostSummary(id: string, context: TenantContext): Promise<{
    tripId: string | null;
    available: boolean;
    fuelCost: number;
    expenseCost: number;
    totalCost: number;
  }> {
    const job = await this.get(id, context);
    if (!job.tripId) {
      return { tripId: null, available: false, fuelCost: 0, expenseCost: 0, totalCost: 0 };
    }

    // The link exists; a trip with no fuel/expense records linked to it
    // yet comes back as a real zero, not an absence -- `available` is
    // about whether a trip exists to report on, not whether it has
    // accrued any cost.
    const row = await tripRepository.getCostAnalyticsForTrip(job.tripId, context.organizationId);
    return { tripId: job.tripId, available: true, ...row };
  }

  private assertTransition(from: DispatchJobStatus, to: DispatchJobStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictError(`Cannot transition dispatch job from "${from}" to "${to}"`);
    }
  }
}

export const dispatchService = new DispatchService();
