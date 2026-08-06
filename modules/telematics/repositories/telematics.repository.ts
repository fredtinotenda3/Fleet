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

  async createAlert(
    vehicleId: string,
    alert: TelematicsAlert,
    tenantId: string
  ): Promise<void> {
    const collection = await this.alertsCollection();
    await collection.insertOne({
      vehicleId,
      ...alert,
      tenantId,
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

    return (result as Geofence) || null;
  }

  async deleteGeofence(id: string, tenantId: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.geofencesCollection();

    const result = await collection.updateOne(
      { _id: new ObjectId(id), tenantId } as any,
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

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

  async updateDeviceLastPing(
    deviceId: string,
    tenantId: string,
    location?: TelematicsLocation
  ): Promise<void> {
    const collection = await this.devicesCollection();

    await collection.updateOne(
      { deviceId, tenantId, isDeleted: { $ne: true } } as any,
      {
        $set: {
          lastPingAt: new Date(),
          lastLocation: location,
          status: 'active',
          updatedAt: new Date(),
        },
      }
    );
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
   * Daily summary for a vehicle, scoped. Delegates to the scoped history
   * read rather than the unscoped one, so the aggregate cannot become a
   * side channel around the row-level filter.
   */
  async getDailySummaryInScope(
    vehicleId: string,
    date: Date,
    context: TenantContext
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