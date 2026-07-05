// modules/telematics/repositories/telematics.repository.ts

import { Db } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';
import {
  TelematicsData,
  TelematicsAlert,
  Geofence,
  TelematicsDevice,
  TelematicsLocation,
} from '../types/telematics.types';
import { Filter, ObjectId } from 'mongodb';

export class TelematicsRepository extends BaseRepository<TelematicsData> {
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
}

export const telematicsRepository = new TelematicsRepository();