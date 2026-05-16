// modules/telematics/repositories/telematics.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { TelematicsData, TelematicsAlert, Geofence, TelematicsDevice } from '../types/telematics.types';
import { Filter, ObjectId } from 'mongodb';

export class TelematicsRepository extends BaseRepository<TelematicsData> {
  protected collectionName = 'tbltelematics';

  // Telematics Data methods
  async getLatestTelematicsData(vehicleId: string, tenantId: string): Promise<TelematicsData | null> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      vehicleId,
    };
    
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
    
    return this.findMany(filter, tenantId, { limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  async getTelematicsByDevice(deviceId: string, tenantId: string, limit: number = 100): Promise<TelematicsData[]> {
    const filter = {
      ...this.getActiveFilter(tenantId),
      deviceId,
    };
    
    return this.findMany(filter, tenantId, { limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  // Alert methods
  async createAlert(vehicleId: string, alert: TelematicsAlert, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const alertsCollection = collection.collection?.('tbltelematics_alerts') || collection;
    
    await alertsCollection.insertOne({
      vehicleId,
      ...alert,
      tenantId,
      createdAt: new Date(),
      isDeleted: false,
    });
  }

  async getActiveAlerts(vehicleId: string, tenantId: string): Promise<TelematicsAlert[]> {
    const collection = await this.getCollection();
    const alertsCollection = collection.collection?.('tbltelematics_alerts') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      vehicleId,
      acknowledgedAt: { $exists: false },
    };
    
    return alertsCollection.find(filter as Filter<any>).toArray();
  }

  async acknowledgeAlert(alertId: string, userId: string, tenantId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const alertsCollection = collection.collection?.('tbltelematics_alerts') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(alertId),
    };
    
    const result = await alertsCollection.updateOne(filter as Filter<any>, {
      $set: { acknowledgedAt: new Date(), acknowledgedBy: userId },
    });
    
    return result.modifiedCount > 0;
  }

  // Geofence methods
  async createGeofence(geofence: Omit<Geofence, '_id' | 'createdAt' | 'updatedAt'>, tenantId: string, userId: string): Promise<Geofence> {
    const collection = await this.getCollection();
    const geofenceCollection = collection.collection?.('tbltelematics_geofences') || collection;
    
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
    
    const result = await geofenceCollection.insertOne(geofenceData);
    return { ...geofenceData, _id: result.insertedId.toString() } as Geofence;
  }

  async getGeofence(id: string, tenantId: string): Promise<Geofence | null> {
    const collection = await this.getCollection();
    const geofenceCollection = collection.collection?.('tbltelematics_geofences') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(id),
    };
    
    const result = await geofenceCollection.findOne(filter as Filter<any>);
    return result as Geofence || null;
  }

  async getActiveGeofences(vehicleId: string | undefined, tenantId: string): Promise<Geofence[]> {
    const collection = await this.getCollection();
    const geofenceCollection = collection.collection?.('tbltelematics_geofences') || collection;
    
    const filter: any = {
      ...this.getActiveFilter(tenantId),
      active: true,
    };
    
    if (vehicleId) {
      filter.$or = [
        { vehicleId },
        { vehicleId: { $exists: false } },
        { vehicleId: null },
      ];
    }
    
    return geofenceCollection.find(filter).toArray();
  }

  async updateGeofence(id: string, geofence: Partial<Geofence>, tenantId: string, userId: string): Promise<Geofence | null> {
    const collection = await this.getCollection();
    const geofenceCollection = collection.collection?.('tbltelematics_geofences') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(id),
    };
    
    const result = await geofenceCollection.findOneAndUpdate(
      filter as Filter<any>,
      { $set: { ...geofence, updatedAt: new Date(), updatedBy: userId } },
      { returnDocument: 'after' }
    );
    
    return result as Geofence || null;
  }

  async deleteGeofence(id: string, tenantId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const geofenceCollection = collection.collection?.('tbltelematics_geofences') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(id),
    };
    
    const result = await geofenceCollection.updateOne(filter as Filter<any>, {
      $set: { isDeleted: true, deletedAt: new Date() },
    });
    
    return result.modifiedCount > 0;
  }

  async getGeofenceState(vehicleId: string, geofenceId: string): Promise<boolean | null> {
    const collection = await this.getCollection();
    const stateCollection = collection.collection?.('tbltelematics_geofence_states') || collection;
    
    const filter = {
      vehicleId,
      geofenceId,
    };
    
    const result = await stateCollection.findOne(filter);
    return result?.isInside ?? null;
  }

  async setGeofenceState(vehicleId: string, geofenceId: string, isInside: boolean): Promise<void> {
    const collection = await this.getCollection();
    const stateCollection = collection.collection?.('tbltelematics_geofence_states') || collection;
    
    await stateCollection.updateOne(
      { vehicleId, geofenceId },
      { $set: { isInside, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  // Device methods
  async registerDevice(device: Omit<TelematicsDevice, '_id' | 'createdAt' | 'updatedAt'>, tenantId: string): Promise<TelematicsDevice> {
    const collection = await this.getCollection();
    const deviceCollection = collection.collection?.('tbltelematics_devices') || collection;
    
    const now = new Date();
    const deviceData = {
      ...device,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    
    const result = await deviceCollection.insertOne(deviceData);
    return { ...deviceData, _id: result.insertedId.toString() } as TelematicsDevice;
  }

  async getDevice(deviceId: string, tenantId: string): Promise<TelematicsDevice | null> {
    const collection = await this.getCollection();
    const deviceCollection = collection.collection?.('tbltelematics_devices') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      deviceId,
    };
    
    const result = await deviceCollection.findOne(filter as Filter<any>);
    return result as TelematicsDevice || null;
  }

  async updateDeviceLastPing(deviceId: string, tenantId: string, location?: any): Promise<void> {
    const collection = await this.getCollection();
    const deviceCollection = collection.collection?.('tbltelematics_devices') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      deviceId,
    };
    
    await deviceCollection.updateOne(filter as Filter<any>, {
      $set: {
        lastPingAt: new Date(),
        lastLocation: location,
        status: 'active',
        updatedAt: new Date(),
      },
    });
  }

  async getOfflineDevices(minutesOffline: number = 5, tenantId: string): Promise<TelematicsDevice[]> {
    const collection = await this.getCollection();
    const deviceCollection = collection.collection?.('tbltelematics_devices') || collection;
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - minutesOffline);
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      status: 'active',
      lastPingAt: { $lt: cutoffDate },
    };
    
    return deviceCollection.find(filter as Filter<any>).toArray();
  }

  // Batch operations
  async bulkInsertTelematics(dataArray: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'>[], tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();
    
    const documents = dataArray.map(data => ({
      ...data,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    }));
    
    await collection.insertMany(documents);
  }

  async getDailySummary(vehicleId: string, date: Date, tenantId: string): Promise<any> {
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
      maxSpeed: Math.max(...data.map(d => d.location?.speed || 0)),
      avgSpeed: data.reduce((sum, d) => sum + (d.location?.speed || 0), 0) / data.length,
      totalDuration: last.trip?.tripDuration || 0,
      fuelUsed: last.trip?.fuelUsed || 0,
      alertCount: data.filter(d => d.alerts?.length).length,
      dataPoints: data.length,
    };
  }
}

export const telematicsRepository = new TelematicsRepository();