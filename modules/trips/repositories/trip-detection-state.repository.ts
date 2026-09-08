// modules/trips/repositories/trip-detection-state.repository.ts
//
// Per-vehicle watermark and open-trip carry-over for the trip
// generation sweep.
//
// ---------------------------------------------------------------------
// WHY THIS IS PERSISTED RATHER THAN HELD IN MEMORY
// ---------------------------------------------------------------------
// A journey spans batches: the sweep runs every few minutes and a
// delivery run lasts an hour, so most runs see a trip that has started
// and not yet ended. That partial state has to survive a worker restart
// and a deploy, or every restart silently truncates whatever trips were
// in flight.
//
// It also has to be shared: with more than one worker instance, an
// in-memory map means two workers each hold half a journey and neither
// produces a correct trip.
//
// ---------------------------------------------------------------------
// WHY IT IS NOT ORG-UNIT SCOPED
// ---------------------------------------------------------------------
// This collection holds no business data -- a timestamp and a partial
// aggregate, both derived from readings the tenant already owns. It is
// never returned to a user, has no read API, and is written only by the
// sweep. It IS tenant-scoped, because a watermark keyed only by
// vehicleId would let one tenant's sweep advance another's.
//
// Registered as 'platform' rather than 'org-unit' in
// module-scope.registry.ts for exactly that reason, alongside the other
// operational bookkeeping collections.

import { Db, Filter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { TripDetectionState, OpenTrip } from '../services/trip-detection';

export const TRIP_DETECTION_STATE_COLLECTION = 'tbltrip_detection_state';

interface TripDetectionStateDoc {
  tenantId: string;
  vehicleId: string;
  /** Serialised OpenTrip, or null when the vehicle is parked. */
  open: (Omit<OpenTrip, 'startAt' | 'lastAt' | 'lastMovingAt'> & {
    startAt: Date;
    lastAt: Date;
    lastMovingAt: Date;
  }) | null;
  lastProcessedAt: Date | null;
  updatedAt: Date;
}

export class TripDetectionStateRepository {
  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<TripDetectionStateDoc>(TRIP_DETECTION_STATE_COLLECTION);
  }

  /**
   * Current state for a vehicle, or a fresh empty state.
   *
   * An absent document is NOT an error -- it is the normal condition for
   * a vehicle whose telemetry has never been swept. It yields
   * `lastProcessedAt: null`, which the caller turns into a bounded
   * first-run window rather than "read everything ever recorded".
   */
  async get(tenantId: string, vehicleId: string): Promise<TripDetectionState> {
    const col = await this.collection();
    const doc = await col.findOne({ tenantId, vehicleId } as Filter<TripDetectionStateDoc>);
    if (!doc) return { open: null, lastProcessedAt: null };
    return {
      open: doc.open as OpenTrip | null,
      lastProcessedAt: doc.lastProcessedAt ?? null,
    };
  }

  /**
   * Persists the carried-forward state.
   *
   * A plain upsert rather than a compare-and-swap: the watermark only
   * ever moves forward within a single sweep, and the sweep holds a
   * per-vehicle lease (see TripGenerationService). Two concurrent
   * sweeps over the same vehicle would both write a monotonically
   * advancing watermark, so the worst case is one redundant re-read --
   * never a duplicated trip, because trip identity is enforced by a
   * unique index rather than by this document.
   */
  async save(tenantId: string, vehicleId: string, state: TripDetectionState): Promise<void> {
    const col = await this.collection();
    await col.updateOne(
      { tenantId, vehicleId } as Filter<TripDetectionStateDoc>,
      {
        $set: {
          open: state.open as TripDetectionStateDoc['open'],
          lastProcessedAt: state.lastProcessedAt,
          updatedAt: new Date(),
        },
        $setOnInsert: { tenantId, vehicleId },
      },
      { upsert: true }
    );
  }

  /** Clears state for a tenant. Used by the business-data reset script. */
  async clearForTenant(tenantId: string): Promise<number> {
    const col = await this.collection();
    const result = await col.deleteMany({ tenantId } as Filter<TripDetectionStateDoc>);
    return result.deletedCount ?? 0;
  }
}

export const tripDetectionStateRepository = new TripDetectionStateRepository();
