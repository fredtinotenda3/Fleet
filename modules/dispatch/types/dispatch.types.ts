// modules/dispatch/types/dispatch.types.ts
import { BaseEntity, Priority } from '@/shared/types/common.types';

export type DispatchJobStatus = 'unassigned' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled';

export interface DispatchJob extends BaseEntity {
  title: string;
  priority: Priority;
  status: DispatchJobStatus;
  pickupLocation: string;
  dropoffLocation?: string;
  scheduledFor?: Date;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledReason?: string;
  notes?: string;

  // --- ROUND 4 (Dispatch <-> Trip) ---
  /**
   * The Trip this dispatch job's work was actually executed as, once
   * one exists. Set either by DispatchService.attachCreatedTrip
   * (DISPATCH -> TRIP: a trip is started directly from this job) or by
   * DispatchService.linkExistingTrip (TRIP -> DISPATCH: an
   * independently-logged trip is associated after the fact -- the
   * no-GPS/no-telemetry case, where nobody flips through
   * assigned/en_route in real time and the trip is simply recorded once
   * the run is done). Optional/unenforced-by-schema the same way
   * Trip.routeId is: a real FK, but this module does not create a
   * second source of truth for it -- Trip.dispatchJobId is the other
   * half of the same link and the two are written together.
   */
  tripId?: string;

  // --- ROUND 4 (Dispatch <-> Customer/Job demand) ---
  /**
   * Optional FK into the existing `tblcustomers` collection
   * (shared/types/customer.types.ts) -- real master data already used
   * by Transport Cost invoicing, not a fabricated Customer concept.
   * Validated against the tenant when supplied (see
   * DispatchService.create); omitted entirely for a dispatch job with
   * no customer context (an internal transfer, say).
   */
  customerId?: string;
  /**
   * Free-text job/order reference (a customer's own PO number, a job
   * sheet number, etc). Same minimal-string convention as
   * `pickupLocation`/`dropoffLocation` -- there is no Order/Job domain
   * model in this codebase to key a real FK against (confirmed by
   * architectural discovery before this round), so this is deliberately
   * NOT a fabricated FK to a collection that doesn't exist.
   */
  jobReference?: string;
}

export interface DispatchJobCreateDTO {
  title: string;
  priority?: Priority;
  pickupLocation: string;
  dropoffLocation?: string;
  scheduledFor?: Date | string;
  notes?: string;
  customerId?: string;
  jobReference?: string;
}

export interface DispatchFilters {
  status?: DispatchJobStatus;
  priority?: Priority;
  assignedDriverId?: string;
  assignedVehicleId?: string;
}