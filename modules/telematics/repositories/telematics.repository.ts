// modules/telematics/repositories/telematics.repository.ts

import { Db } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
import './../types/telematics.tenancy-addendum';
import {
  TelematicsData,
  TelematicsAlert,
  Geofence,
  TelematicsDevice,
  TelematicsLocation,
} from '../types/telematics.types';
import { Filter, ObjectId } from 'mongodb';
import { PROVIDER_EAGLETRACK } from '../providers/provider.types';
import { resolveExternalDeviceId } from '../providers/provider.resolve';
import type { ResolvedAlertOwnership } from '../services/alert-ownership.resolver';

/**
 * UTC midnight for a date -- the key rollup rows are stored under.
 *
 * Restated here rather than imported from telemetry-rollup.service.ts
 * so the repository keeps no module-load-time dependency on a service
 * that imports it back. One line, and the rollup service's `dayBucket`
 * is the definition it must agree with; the rollup read is tested
 * against rows written by that service, so a divergence fails a test
 * rather than silently missing every row.
 */
function dayBucketUtc(timestamp: Date): Date {
  return new Date(
    Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate())
  );
}
import { invalidateTenantGeofences } from '../services/geofence-evaluation';

/**
 * SCOPED (Phase F).
 *
 * The most privacy-sensitive collection in the product: in aggregate,
 * tbltelematics is a movement history of identifiable employees.
 *
 * Note the shape of the enforcement here. Every read below is already
 * keyed by a `vehicleId`, so the meaningful question is not "filter the
 * rows" but "may this caller see this vehicle at all". Both are
 * implemented: `scopeOf()` supplies the orgUnitId predicate for list
 * reads, and the *InScope variants apply it so an out-of-scope vehicleId
 * returns empty rather than another branch's GPS trace.
 */
export class TelematicsRepository extends TenantScopedRepository<TelematicsData> {
  protected collectionName = 'tbltelematics';

  private async getDb(): Promise<Db> {
    return connectToDatabase();
  }

  private async alertsCollection() {
    const db = await this.getDb();
    return db.collection<TelematicsAlert & { vehicleId: string; tenantId: string }>(
      'tbltelematics_alerts'
    );
  }

  private async geofencesCollection() {
    const db = await this.getDb();
    return db.collection<Geofence>('tbltelematics_geofences');
  }

  private async geofenceStatesCollection() {
    const db = await this.getDb();
    return db.collection<{
      vehicleId: string;
      geofenceId: string;
      isInside: boolean;
      updatedAt: Date;
    }>('tbltelematics_geofence_states');
  }

  private async devicesCollection() {
    const db = await this.getDb();
    return db.collection<TelematicsDevice>('tbltelematics_devices');
  }

  /**
   * The orgUnitId predicate for this caller. Returns `{}` for a
   * full-visibility role, `{ orgUnitId: { $in: [] } }` (matches nothing)
   * for a scoped caller with no accessible units -- fail closed.
   */
  private scopeOf(context: TenantContext): Record<string, unknown> {
    return tenantScopeService.buildFilter<TelematicsData>(
      context,
      'orgUnitId'
    ) as Record<string, unknown>;
  }

  // ── Telematics Data ─────────────────────────────────────────────────

  async getLatestTelematicsData(
    vehicleId: string,
    tenantId: string
  ): Promise<TelematicsData | null> {
    const collection = await this.getCollection();
    const filter = { ...this.getActiveFilter(tenantId), vehicleId };

    const result = await collection
      .find(filter as Filter<TelematicsData>)
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    return result[0] || null;
  }

  async getTelematicsHistory(
    vehicleId: string,
    startDate: Date,
    endDate: Date,
    tenantId: string,
    limit: number = 1000
  ): Promise<TelematicsData[]> {
    const filter = {
      ...this.getActiveFilter(tenantId),
      vehicleId,
      timestamp: { $gte: startDate, $lte: endDate },
    };

    return this.findMany(filter, tenantId, {
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    });
  }

  async getTelematicsByDevice(
    deviceId: string,
    tenantId: string,
    limit: number = 100
  ): Promise<TelematicsData[]> {
    const filter = { ...this.getActiveFilter(tenantId), deviceId };
    return this.findMany(filter, tenantId, {
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    });
  }

  async bulkInsertTelematics(
    dataArray: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'>[],
    tenantId: string
  ): Promise<void> {
    if (dataArray.length === 0) return;
    const collection = await this.getCollection();
    const now = new Date();

    const documents = dataArray.map((data) => ({
      ...data,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    }));

    await collection.insertMany(documents as any[]);
  }

  async getDailySummary(
    vehicleId: string,
    date: Date,
    tenantId: string
  ): Promise<{
    vehicleId: string;
    date: Date;
    totalDistance: number;
    maxSpeed: number;
    avgSpeed: number;
    totalDuration: number;
    fuelUsed: number;
    alertCount: number;
    dataPoints: number;
  } | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const data = await this.getTelematicsHistory(vehicleId, startOfDay, endOfDay, tenantId);
    if (data.length === 0) return null;

    const first = data[data.length - 1];
    const last = data[0];

    return {
      vehicleId,
      date,
      totalDistance: (last.trip?.odometer || 0) - (first.trip?.odometer || 0),
      maxSpeed: Math.max(...data.map((d) => d.location?.speed || 0)),
      avgSpeed: data.reduce((sum, d) => sum + (d.location?.speed || 0), 0) / data.length,
      totalDuration: last.trip?.tripDuration || 0,
      // fuelUsed lives under `fuel`, not `trip`, per TelematicsData's shape.
      fuelUsed: last.fuel?.fuelUsed || 0,
      alertCount: data.filter((d) => (d.alerts?.length || 0) > 0).length,
      dataPoints: data.length,
    };
  }

  // ── Alerts ───────────────────────────────────────────────────────────

  /**
   * BACKLOG ITEM 2 (finding N-3) -- alerts now carry their owning org
   * unit.
   *
   * `ownership` is a REQUIRED parameter, and its type can only be
   * produced by `resolveAlertOwnership`. That is the point: the original
   * defect was a call site that simply did not pass an org unit, and an
   * optional parameter would let the next call site make the same
   * omission while still type-checking. Making it required means a new
   * writer has to go and find out who owns the alert before it can
   * compile.
   *
   * `orgUnitId` is written only when it was actually resolved. An
   * unresolvable owner leaves the field unset -- invisible to
   * org-unit-scoped reads, the same fail-closed treatment every other
   * unbackfilled row gets -- and `orgUnitResolution` records WHY, so an
   * operator investigating an alert nobody can see is not left to infer
   * it. Existing rows are untouched; `npm run db:backfill-alert-orgunits`
   * is the separate, audited migration for those.
   */
  async createAlert(
    vehicleId: string,
    alert: TelematicsAlert,
    tenantId: string,
    ownership: ResolvedAlertOwnership
  ): Promise<void> {
    const collection = await this.alertsCollection();
    await collection.insertOne({
      vehicleId,
      ...alert,
      tenantId,
      // Spread order matters: ownership is authoritative and must own
      // the key, so a TelematicsAlert that somehow carried an orgUnitId
      // of its own cannot override the resolved one. Same rule as the
      // scope predicate being spread last in every scoped filter.
      ...(ownership.orgUnitId ? { orgUnitId: ownership.orgUnitId } : {}),
      orgUnitResolution: ownership.resolution,
      createdAt: new Date(),
      isDeleted: false,
    } as any);
  }

  async getActiveAlerts(vehicleId: string, tenantId: string): Promise<TelematicsAlert[]> {
    const collection = await this.alertsCollection();
    const filter = {
      tenantId,
      isDeleted: { $ne: true },
      vehicleId,
      acknowledgedAt: { $exists: false },
    };

    return collection.find(filter as any).toArray() as Promise<TelematicsAlert[]>;
  }

  async acknowledgeAlert(alertId: string, userId: string, tenantId: string): Promise<boolean> {
    if (!ObjectId.isValid(alertId)) return false;
    const collection = await this.alertsCollection();

    const result = await collection.updateOne(
      { _id: new ObjectId(alertId), tenantId } as any,
      { $set: { acknowledgedAt: new Date(), acknowledgedBy: userId } }
    );

    return result.modifiedCount > 0;
  }

  // ── Geofences ────────────────────────────────────────────────────────

  async createGeofence(
    geofence: Omit<Geofence, '_id' | 'createdAt' | 'updatedAt'>,
    tenantId: string,
    userId: string
  ): Promise<Geofence> {
    const collection = await this.geofencesCollection();
    const now = new Date();

    const geofenceData = {
      ...geofence,
      tenantId,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    // PHASE 4, F-13: drop the tenant's cached geofence list so an
    // operator's edit applies on the next ping rather than up to
    // GEOFENCE_CACHE_TTL_MS later. Invalidated at the REPOSITORY because
    // it is the single choke point every geofence write passes through --
    // doing it in the service would miss the Eagle Track trigger sync,
    // which writes boundaries directly via upsertProviderGeofence.
    invalidateTenantGeofences(tenantId);

    const result = await collection.insertOne(geofenceData as any);
    return { ...geofenceData, _id: result.insertedId.toString() } as Geofence;
  }

  async getGeofence(id: string, tenantId: string): Promise<Geofence | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.geofencesCollection();

    const result = await collection.findOne({
      _id: new ObjectId(id),
      tenantId,
      isDeleted: { $ne: true },
    } as any);

    return (result as Geofence) || null;
  }

  async getActiveGeofences(
    vehicleId: string | undefined,
    tenantId: string
  ): Promise<Geofence[]> {
    const collection = await this.geofencesCollection();

    const filter: Record<string, unknown> = {
      tenantId,
      isDeleted: { $ne: true },
      active: true,
    };

    if (vehicleId) {
      filter.$or = [
        { vehicleId },
        { vehicleId: { $exists: false } },
        { vehicleId: null },
      ];
    }

    return collection.find(filter as any).toArray() as Promise<Geofence[]>;
  }

  async updateGeofence(
    id: string,
    geofence: Partial<Geofence>,
    tenantId: string,
    userId: string
  ): Promise<Geofence | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.geofencesCollection();

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id), tenantId, isDeleted: { $ne: true } } as any,
      { $set: { ...geofence, updatedAt: new Date(), updatedBy: userId } },
      { returnDocument: 'after' }
    );

    invalidateTenantGeofences(tenantId);
    return (result as Geofence) || null;
  }

  async deleteGeofence(id: string, tenantId: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.geofencesCollection();

    const result = await collection.updateOne(
      { _id: new ObjectId(id), tenantId } as any,
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    invalidateTenantGeofences(tenantId);
    return result.modifiedCount > 0;
  }

  // ── Geofence state (batched) ────────────────────────────────────────

  async getGeofenceStatesForVehicle(
    vehicleId: string,
    geofenceIds: string[]
  ): Promise<Map<string, boolean>> {
    if (geofenceIds.length === 0) return new Map();
    const collection = await this.geofenceStatesCollection();

    const results = await collection
      .find({ vehicleId, geofenceId: { $in: geofenceIds } })
      .toArray();

    const map = new Map<string, boolean>();
    for (const r of results) {
      map.set(r.geofenceId, r.isInside);
    }
    return map;
  }

  async setGeofenceStates(
    vehicleId: string,
    updates: Array<{ geofenceId: string; isInside: boolean }>
  ): Promise<void> {
    if (updates.length === 0) return;
    const collection = await this.geofenceStatesCollection();

    const operations = updates.map((u) => ({
      updateOne: {
        filter: { vehicleId, geofenceId: u.geofenceId },
        update: {
          $set: { isInside: u.isInside, updatedAt: new Date() },
        },
        upsert: true,
      },
    }));

    await collection.bulkWrite(operations);
  }

  async getGeofenceState(vehicleId: string, geofenceId: string): Promise<boolean | null> {
    const map = await this.getGeofenceStatesForVehicle(vehicleId, [geofenceId]);
    return map.get(geofenceId) ?? null;
  }

  async setGeofenceState(vehicleId: string, geofenceId: string, isInside: boolean): Promise<void> {
    await this.setGeofenceStates(vehicleId, [{ geofenceId, isInside }]);
  }

  // ── Devices ──────────────────────────────────────────────────────────

  async registerDevice(
    device: Omit<TelematicsDevice, '_id' | 'createdAt' | 'updatedAt'>,
    tenantId: string
  ): Promise<TelematicsDevice> {
    const collection = await this.devicesCollection();
    const now = new Date();

    const deviceData = {
      ...device,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const result = await collection.insertOne(deviceData as any);
    return { ...deviceData, _id: result.insertedId.toString() } as TelematicsDevice;
  }

  async getDevice(deviceId: string, tenantId: string): Promise<TelematicsDevice | null> {
    const collection = await this.devicesCollection();
    const result = await collection.findOne({
      deviceId,
      tenantId,
      isDeleted: { $ne: true },
    } as any);

    return (result as TelematicsDevice) || null;
  }

  /**
   * Records a successful ingest for a device.
   *
   * `lastPingAt` is ALWAYS stamped with the real wall-clock "now" -- it
   * answers "when did we last hear from this device" for offline
   * detection (getOfflineDevices) and must never be derived from a
   * provider's own payload.
   *
   * `fix`, when supplied, additionally records the PROVIDER'S OWN
   * timestamp for this reading (`lastFixAt`) and an optional adapter-
   * specific comparison signature (`fix.metadataPatch`, merged into
   * `metadata` by key) that a staleness guard can use to detect a
   * same-timestamp-but-changed fix. Backward compatible: callers that
   * omit `fix` (e.g. CartrackAdapter, which has no staleness guard) see
   * no change in behaviour -- lastFixAt and metadata are left untouched.
   */
  async updateDeviceLastPing(
    deviceId: string,
    tenantId: string,
    location?: TelematicsLocation,
    fix?: { fixTimestamp?: Date; metadataPatch?: Record<string, unknown> }
  ): Promise<void> {
    const collection = await this.devicesCollection();

    const set: Record<string, unknown> = {
      lastPingAt: new Date(),
      lastLocation: location,
      status: 'active',
      updatedAt: new Date(),
    };

    if (fix?.fixTimestamp && !Number.isNaN(fix.fixTimestamp.getTime())) {
      set.lastFixAt = fix.fixTimestamp;
    }

    if (fix?.metadataPatch) {
      for (const [key, value] of Object.entries(fix.metadataPatch)) {
        set[`metadata.${key}`] = value;
      }
    }

    await collection.updateOne({ deviceId, tenantId, isDeleted: { $ne: true } } as any, { $set: set });
  }

  async getOfflineDevices(
    tenantId: string,
    minutesOffline: number = 5
  ): Promise<TelematicsDevice[]> {
    const collection = await this.devicesCollection();
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - minutesOffline);

    return collection
      .find({
        tenantId,
        isDeleted: { $ne: true },
        status: 'active',
        lastPingAt: { $lt: cutoffDate },
      } as any)
      .toArray() as Promise<TelematicsDevice[]>;
  }

  /**
   * Counts devices for one provider whose `lastFixAt` (the PROVIDER'S
   * own reported fix time, never `lastPingAt` -- see telematics.types.ts)
   * is older than `cutoff`.
   *
   * PLATFORM-WIDE, not tenant-scoped, and deliberately returns a COUNT
   * rather than the devices themselves: this backs
   * fleet_telematics_stale_vehicles{provider}, a Prometheus gauge, and a
   * gauge labelled by tenantId or vehicleId would grow a scrape target
   * without bound as a fleet churns vehicles -- the same cardinality
   * rule metrics.registry.ts documents for every other telematics
   * metric. Devices with no `lastFixAt` at all (never ingested a fix)
   * are not counted here: `$lt` against a missing field matches nothing
   * in MongoDB, so an unprovisioned device is silently excluded rather
   * than counted as maximally stale.
   */
  async countStaleDevicesByProvider(providerId: string, cutoff: Date): Promise<number> {
    const collection = await this.devicesCollection();
    return collection.countDocuments({
      providerId,
      isDeleted: { $ne: true },
      lastFixAt: { $lt: cutoff },
    } as any);
  }

  // ── Org-unit-scoped read variants (Phase F) ─────────────────────────

  /** Latest fix for a vehicle, or null when the vehicle is outside the caller's scope. */
  async getLatestTelematicsDataInScope(
    vehicleId: string,
    context: TenantContext
  ): Promise<TelematicsData | null> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(context.organizationId),
      ...this.scopeOf(context),
      vehicleId,
    };

    const result = await collection
      .find(filter as Filter<TelematicsData>)
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    return result[0] || null;
  }

  /** GPS history for a vehicle, empty when the vehicle is outside the caller's scope. */
  async getTelematicsHistoryInScope(
    vehicleId: string,
    startDate: Date,
    endDate: Date,
    context: TenantContext,
    limit: number = 1000
  ): Promise<TelematicsData[]> {
    const filter = {
      ...this.scopeOf(context),
      vehicleId,
      timestamp: { $gte: startDate, $lte: endDate },
    };

    return this.findMany(filter as Filter<TelematicsData>, context.organizationId, {
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    });
  }

  async getActiveAlertsInScope(
    vehicleId: string,
    context: TenantContext
  ): Promise<TelematicsAlert[]> {
    const collection = await this.alertsCollection();
    const filter = {
      tenantId: context.organizationId,
      isDeleted: { $ne: true },
      vehicleId,
      acknowledgedAt: { $exists: false },
      ...this.scopeOf(context),
    };

    return collection.find(filter as any).toArray() as Promise<TelematicsAlert[]>;
  }

  /**
   * Geofences visible to this caller.
   *
   * A geofence with NO orgUnitId is organization-wide shared boundary
   * data (a depot perimeter every branch needs) and stays visible to
   * everyone -- so the predicate is "mine OR unassigned", not a bare
   * $in. That asymmetry with the other collections is deliberate and is
   * why the backfill refuses to invent an orgUnitId for geofences.
   */
  async getActiveGeofencesInScope(
    vehicleId: string | undefined,
    context: TenantContext
  ): Promise<Geofence[]> {
    const collection = await this.geofencesCollection();

    const conditions: Record<string, unknown>[] = [
      { tenantId: context.organizationId, isDeleted: { $ne: true }, active: true },
    ];

    if (vehicleId) {
      conditions.push({
        $or: [{ vehicleId }, { vehicleId: { $exists: false } }, { vehicleId: null }],
      });
    }

    if (context.accessibleOrgUnitIds !== null) {
      conditions.push({
        $or: [
          { orgUnitId: { $in: context.accessibleOrgUnitIds } },
          { orgUnitId: { $exists: false } },
          { orgUnitId: null },
        ],
      });
    }

    return collection.find({ $and: conditions } as any).toArray() as Promise<Geofence[]>;
  }

  async getOfflineDevicesInScope(
    context: TenantContext,
    minutesOffline: number = 5
  ): Promise<TelematicsDevice[]> {
    const collection = await this.devicesCollection();
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - minutesOffline);

    return collection
      .find({
        tenantId: context.organizationId,
        isDeleted: { $ne: true },
        status: 'active',
        lastPingAt: { $lt: cutoffDate },
        ...this.scopeOf(context),
      } as any)
      .toArray() as Promise<TelematicsDevice[]>;
  }

  /**
   * The Eagle Track tracker id installed in a vehicle, or null.
   *
   * PHASE 2: matches on the first-class `providerId` field, falling back
   * to the historical `^eagletrack-` device-id prefix for rows written
   * before Phase 2 (until scripts/backfill-device-provider.ts has run).
   * The provider's own id is read from `externalDeviceId` when present,
   * and only stripped from the prefix otherwise -- so a provider whose
   * ids contain a hyphen no longer breaks the parse.
   *
   * Kept Eagle-Track-specific ON PURPOSE. It exists for one caller (the
   * Eagle Track history/fuel endpoints, which need a uin to query the
   * vendor), so making it generic would be a speculative abstraction of
   * a vendor-specific need. The provider-neutral path for "give me this
   * vehicle's readings" is getTelematicsHistory, which knows nothing
   * about providers at all.
   *
   * Newest device wins when a vehicle has had more than one tracker
   * fitted: the current one is what matters for "fetch this vehicle's
   * history", and an old device's uin would pull the history of whatever
   * vehicle that tracker is in NOW.
   */
  async getEagleTrackUinForVehicle(vehicleId: string, tenantId: string): Promise<string | null> {
    const collection = await this.devicesCollection();
    const device = await collection.findOne(
      {
        tenantId,
        vehicleId,
        isDeleted: { $ne: true },
        $or: [
          { providerId: PROVIDER_EAGLETRACK },
          // Transitional: rows written before Phase 2 carry no
          // providerId. Removable once the backfill has run everywhere.
          { providerId: { $exists: false }, deviceId: { $regex: `^${PROVIDER_EAGLETRACK}-` } },
        ],
      } as never,
      { sort: { createdAt: -1 } }
    );

    if (!device) return null;

    const uin = resolveExternalDeviceId(
      device as { externalDeviceId?: string; providerId?: string; deviceId?: string }
    );
    return uin || null;
  }

  // ── Provider backfill / reconciliation (Eagle Track history) ────────

  /**
   * Idempotent bulk write of HISTORICAL readings.
   *
   * ---------------------------------------------------------------
   * WHY THIS DOES NOT GO THROUGH telematicsService.ingestTelematicsData
   * ---------------------------------------------------------------
   * Every provider adapter until now has written through that service
   * deliberately, so its readings get the same alerting, geofence
   * evaluation and notifications as the generic ingest endpoint. That
   * is exactly the wrong thing for a BACKFILL. Replaying a month of
   * history through the live path would, per historical point:
   * re-evaluate every geofence and emit entry/exit alerts for
   * boundaries the vehicle crossed weeks ago; re-raise speeding and
   * low-fuel alerts and push a fleet-manager notification for each of
   * the high/critical ones; emit a `vehicle:location` websocket frame
   * moving the live map to a stale position; and enqueue a
   * REFRESH_ANALYTICS job per point.
   *
   * A backfill is an assertion about the PAST. It writes rows and
   * nothing else. Vendor-side alerts for the same window are imported
   * separately and explicitly (see eagletrack-alert-sync.service.ts),
   * which is the honest way to get historical alerting: the provider's
   * own events, not ours re-derived and re-notified.
   *
   * ---------------------------------------------------------------
   * IDEMPOTENCY
   * ---------------------------------------------------------------
   * One upsert per reading keyed on
   * (tenantId, vehicleId, deviceId, timestamp) with $setOnInsert, so
   * re-running the same window writes nothing the second time. Keyed on
   * the PROVIDER'S timestamp rather than an ingest time, for the same
   * reason the staleness guard compares against `lastFixAt`: two
   * different clocks make "the same reading" unanswerable.
   *
   * RESIDUAL RACE, stated rather than hidden: without a unique index,
   * two concurrent runs over the same window can both miss and both
   * insert. Bounded in practice -- history ingestion is triggered per
   * vehicle by a user action, and the read-through lock already
   * serialises per tenant -- but the durable fix is a partial unique
   * index on that key, recorded in the changelog as a follow-up rather
   * than shipped as an unreviewed migration.
   */
  /**
   * PHASE 4, F-12 -- streams one day's readings for the rollup job.
   *
   * CROSS-TENANT BY DESIGN, like the outbox processor and the schedulers:
   * the rollup is a platform job that must summarise every tenant's day,
   * and passing it a single tenant id would silently stop rolling up for
   * everyone else. Isolation is preserved where it belongs -- each
   * reading carries its own tenantId and orgUnitId, and
   * `aggregateReadings` groups strictly by (vehicle, day) within the
   * rows it is given, so a rollup can never merge two tenants.
   *
   * Returns a CURSOR, not an array. A day of fixes for a 1,000-vehicle
   * fleet is ~1.7M documents; materialising that is the same defect
   * Phase 4 is removing from the backup worker.
   */
  async streamReadingsForDay(day: Date): Promise<import('mongodb').FindCursor<TelematicsData>> {
    const collection = await this.getCollection();

    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    return collection.find(
      { timestamp: { $gte: start, $lt: end } } as never,
      // Sorted by tenant+vehicle so the caller can accumulate one
      // vehicle at a time and flush, rather than holding the whole day.
      { sort: { tenantId: 1, vehicleId: 1, timestamp: 1 } }
    ) as unknown as import('mongodb').FindCursor<TelematicsData>;
  }

  /**
   * BACKLOG ITEM 5 -- daily rollups for one vehicle and window, scoped.
   *
   * Reads `[from, to)` half-open on `day`, so a caller passing a UTC
   * midnight as `to` does not silently pick up that whole day: rollup
   * days ARE UTC midnights, and an inclusive `$lte` would include the
   * boundary day in both halves of a mixed window and double-count it.
   *
   * SCOPED like every other read in this module. Rollups carry the
   * `orgUnitId` of the readings they summarise (see
   * telemetry-rollup.service.ts), so `scopeOf` applies unchanged and an
   * aggregate over expired telemetry cannot become the side channel the
   * row-level filter closed -- which is precisely the trap Phase G
   * found in the anomaly severity counts and Phase H in the report
   * engine's `$match`.
   *
   * Hits `idx_telematics_rollup_tenant_unit_day`, which was declared for
   * this read in Phase 4 and until now had no caller.
   */
  async getDailyRollupsInScope(
    vehicleId: string,
    from: Date,
    to: Date,
    context: TenantContext
  ): Promise<Array<Record<string, unknown>>> {
    const db = await this.getDb();
    const collection = db.collection('tbltelematics_daily_rollup');

    const filter = {
      tenantId: context.organizationId,
      isDeleted: { $ne: true },
      vehicleId,
      day: { $gte: from, $lt: to },
      // Spread LAST so scope owns the orgUnitId key -- the rule Phase H
      // established after the report engine let a caller filter over it.
      ...this.scopeOf(context),
    };

    return collection
      .find(filter as never, { sort: { day: 1 } })
      .toArray() as unknown as Promise<Array<Record<string, unknown>>>;
  }

  /**
   * Upserts daily rollups.
   *
   * Keyed on {tenantId, vehicleId, day} -- the unique index -- so
   * re-running a day (a retry, a corrected window) overwrites rather
   * than duplicating. Without that, two concurrent runs over the same
   * day both insert and every downstream aggregate doubles.
   */
  async upsertDailyRollups(
    rollups: Array<Record<string, unknown> & { tenantId: string; vehicleId: string; day: Date }>
  ): Promise<number> {
    if (rollups.length === 0) return 0;

    const db = await this.getDb();
    const collection = db.collection('tbltelematics_daily_rollup');
    const now = new Date();

    const result = await collection.bulkWrite(
      rollups.map((rollup) => ({
        updateOne: {
          filter: {
            tenantId: rollup.tenantId,
            vehicleId: rollup.vehicleId,
            day: rollup.day,
          },
          update: {
            $set: { ...rollup, updatedAt: now },
            // createdAt drives the rollup TTL, so it must NOT be reset
            // by a re-run -- otherwise a corrected day silently restarts
            // its retention clock and outlives the policy.
            $setOnInsert: { createdAt: now, isDeleted: false },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }

  async bulkUpsertHistoricalReadings(
    readings: Array<Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string }>,
    tenantId: string
  ): Promise<{ inserted: number; existing: number }> {
    if (readings.length === 0) return { inserted: 0, existing: 0 };

    const collection = await this.getCollection();
    const now = new Date();

    // In-batch de-dupe first: a vendor page that repeats a timestamp
    // would otherwise produce two upserts on the same key inside one
    // bulkWrite, which Mongo applies in order and which would then
    // report an insert followed by a no-op update -- inflating the
    // inserted count for a row that only exists once.
    const seen = new Set<string>();
    const operations: object[] = [];

    for (const reading of readings) {
      const key = `${reading.vehicleId}|${reading.deviceId}|${new Date(reading.timestamp).getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      operations.push({
        updateOne: {
          filter: {
            tenantId,
            vehicleId: reading.vehicleId,
            deviceId: reading.deviceId,
            timestamp: reading.timestamp,
          },
          update: {
            $setOnInsert: {
              ...reading,
              tenantId,
              createdAt: now,
              updatedAt: now,
              isDeleted: false,
            },
          },
          upsert: true,
        },
      });
    }

    if (operations.length === 0) return { inserted: 0, existing: 0 };

    const result = await collection.bulkWrite(operations as never[], { ordered: false });
    const inserted = result.upsertedCount ?? 0;

    return { inserted, existing: operations.length - inserted };
  }

  /**
   * Idempotent write of PROVIDER-SIDE alerts.
   *
   * `providerAlertKey` is the identity (see buildVendorAlertKey): the
   * vendor's own alert id where it supplies one, otherwise the
   * uin+time+trigger tuple that makes two rows the same event. Keyed on
   * it so a repeat sync over an overlapping window recognises what it
   * already holds instead of duplicating a month of alerts every time
   * somebody opens the map.
   *
   * STAMPS orgUnitId, unlike createAlert above. reading-alerts.ts
   * documents why that matters: getActiveAlertsInScope applies the
   * org-unit predicate, so an alert row written without one matches zero
   * rows for every scoped caller. Existing rows are untouched -- this
   * only fixes the rows this path writes, and the backfill for the rest
   * stays the separate change it has always been.
   */
  async upsertVendorAlerts(
    alerts: Array<{
      vehicleId: string;
      orgUnitId?: string;
      providerAlertKey: string;
      providerTriggerId?: string;
      providerTypeCode: number | null;
      providerTypeLabel: string | null;
      providerMetadata: Record<string, unknown>;
      alert: TelematicsAlert;
    }>,
    tenantId: string
  ): Promise<{ imported: number; duplicates: number }> {
    if (alerts.length === 0) return { imported: 0, duplicates: 0 };

    const collection = await this.alertsCollection();
    const now = new Date();

    const seen = new Set<string>();
    const operations: object[] = [];

    for (const entry of alerts) {
      if (seen.has(entry.providerAlertKey)) continue;
      seen.add(entry.providerAlertKey);

      operations.push({
        updateOne: {
          filter: { tenantId, providerAlertKey: entry.providerAlertKey },
          update: {
            $setOnInsert: {
              ...entry.alert,
              vehicleId: entry.vehicleId,
              orgUnitId: entry.orgUnitId,
              tenantId,
              providerAlertKey: entry.providerAlertKey,
              providerTriggerId: entry.providerTriggerId,
              providerTypeCode: entry.providerTypeCode,
              providerTypeLabel: entry.providerTypeLabel,
              providerMetadata: entry.providerMetadata,
              createdAt: now,
              isDeleted: false,
            },
          },
          upsert: true,
        },
      });
    }

    if (operations.length === 0) return { imported: 0, duplicates: 0 };

    const result = await collection.bulkWrite(operations as never[], { ordered: false });
    const imported = result.upsertedCount ?? 0;

    return { imported, duplicates: operations.length - imported };
  }

  /**
   * Creates or refreshes the Geofence a spatial provider trigger
   * projects into, keyed on the PROVIDER'S trigger id.
   *
   * That key is the whole duplicate-prevention story: matching on `name`
   * instead would create a second boundary the moment somebody renames
   * a geofence in the vendor UI, and the old one would keep firing.
   *
   * DELIBERATELY NARROW $set. Only the fields the provider is the
   * authority on (name, type, coordinates) are overwritten. `alerts`
   * (entry/exit/inside) and `active` are set on INSERT only, because
   * they are local operational choices: an operator who has turned off
   * exit alerts for a noisy depot boundary must not have that decision
   * silently reverted by the next sync.
   */
  async upsertProviderGeofence(
    input: {
      provider: string;
      providerTriggerId: string;
      name: string;
      type: Geofence['type'];
      coordinates: Geofence['coordinates'];
      orgUnitId?: string;
      vehicleId?: string;
    },
    tenantId: string
  ): Promise<{ geofenceId: string; outcome: 'created' | 'updated' }> {
    const collection = await this.geofencesCollection();
    const now = new Date();

    const filter = {
      tenantId,
      provider: input.provider,
      providerTriggerId: input.providerTriggerId,
    };

    const result = await collection.findOneAndUpdate(
      filter as never,
      {
        $set: {
          name: input.name,
          type: input.type,
          coordinates: input.coordinates,
          orgUnitId: input.orgUnitId,
          vehicleId: input.vehicleId,
          isDeleted: false,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          provider: input.provider,
          providerTriggerId: input.providerTriggerId,
          // Local operational choices -- see the doc comment.
          active: true,
          alerts: { entry: true, exit: true, inside: false },
          createdAt: now,
        },
      } as never,
      { upsert: true, returnDocument: 'after', includeResultMetadata: true }
    );

    const doc = result?.value as (Geofence & { _id?: unknown }) | null;
    const geofenceId = doc?._id ? String(doc._id) : '';
    const outcome = result?.lastErrorObject?.updatedExisting ? 'updated' : 'created';

    // PHASE 4, F-13: the provider trigger sync writes boundaries
    // directly, bypassing the service layer -- so it must invalidate too,
    // or a newly-synced vendor geofence would not be evaluated until the
    // cache expired.
    invalidateTenantGeofences(tenantId);

    return { geofenceId, outcome };
  }

  /**
   * Daily summary for a vehicle, scoped. Delegates to the scoped history
   * read rather than the unscoped one, so the aggregate cannot become a
   * side channel around the row-level filter.
   *
   * BACKLOG ITEM 5: falls back to the day's ROLLUP row once the raw
   * fixes for that day have aged out. Before this, any day older than
   * TELEMETRY_RETENTION_DAYS returned `null` -- which a caller cannot
   * distinguish from "that vehicle did not report that day".
   *
   * `source` is on the returned object precisely so the substitution is
   * never silent: 'raw' means per-fix detail, 'rollup' means the stored
   * per-day aggregate. `dataPoints` on a rollup answer is the fix count
   * the rollup RECORDED at the time, not rows read now.
   *
   * `totalDuration` is absent from a rollup answer rather than zeroed:
   * a rollup carries no trip duration, and a fabricated 0 hours for a
   * day the vehicle actually drove is the class of defect Phase 1
   * removed from the adapters.
   */
  async getDailySummaryInScope(
    vehicleId: string,
    date: Date,
    context: TenantContext,
    now: Date = new Date()
  ): Promise<{
    vehicleId: string;
    date: Date;
    source: 'raw' | 'rollup';
    totalDistance: number;
    maxSpeed: number;
    avgSpeed: number;
    totalDuration?: number;
    fuelUsed: number;
    alertCount: number;
    dataPoints: number;
  } | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Lazy import: the repository must not take a module-load-time
    // dependency on a service that imports it back.
    const { windowPredatesRawRetention } = await import('../services/telemetry-window');

    if (windowPredatesRawRetention(startOfDay, now)) {
      const rollup = await this.getDailyRollupsInScope(
        vehicleId,
        dayBucketUtc(startOfDay),
        new Date(dayBucketUtc(startOfDay).getTime() + 24 * 60 * 60 * 1000),
        context
      );
      const row = rollup[0];
      if (!row) return null;

      const distance = typeof row.distanceKm === 'number' ? row.distanceKm : 0;
      return {
        vehicleId,
        date,
        source: 'rollup',
        totalDistance: distance,
        maxSpeed: typeof row.maxSpeedKmh === 'number' ? row.maxSpeedKmh : 0,
        avgSpeed: typeof row.avgSpeedKmh === 'number' ? row.avgSpeedKmh : 0,
        fuelUsed: typeof row.fuelUsedLitres === 'number' ? row.fuelUsedLitres : 0,
        alertCount: typeof row.alertCount === 'number' ? row.alertCount : 0,
        dataPoints: typeof row.fixCount === 'number' ? row.fixCount : 0,
      };
    }

    const data = await this.getTelematicsHistoryInScope(
      vehicleId,
      startOfDay,
      endOfDay,
      context
    );
    if (data.length === 0) return null;

    const first = data[data.length - 1];
    const last = data[0];

    return {
      vehicleId,
      date,
      source: 'raw',
      totalDistance: (last.trip?.odometer || 0) - (first.trip?.odometer || 0),
      maxSpeed: Math.max(...data.map((d) => d.location?.speed || 0)),
      avgSpeed: data.reduce((sum, d) => sum + (d.location?.speed || 0), 0) / data.length,
      totalDuration: last.trip?.tripDuration || 0,
      fuelUsed: last.fuel?.fuelUsed || 0,
      alertCount: data.filter((d) => (d.alerts?.length || 0) > 0).length,
      dataPoints: data.length,
    };
  }
}

export const telematicsRepository = new TelematicsRepository();