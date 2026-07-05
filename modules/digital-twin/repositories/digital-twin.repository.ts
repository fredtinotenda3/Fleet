// modules/digital-twin/repositories/digital-twin.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  VehicleDigitalTwin,
  DigitalTwinFilters,
  FleetTwinSummary,
  TwinAlertSeverity,
} from '../types/digital-twin.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

const SEVERITY_RANK: Record<TwinAlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export class DigitalTwinRepository extends BaseRepository<VehicleDigitalTwin> {
  protected collectionName = 'tblvehicledigitaltwins';

  async findByVehicleId(vehicleId: string, tenantId: string): Promise<VehicleDigitalTwin | null> {
    return this.findOne({ vehicleId } as Filter<VehicleDigitalTwin>, tenantId);
  }

  /**
   * Applies a partial patch to a twin, upserting if it doesn't yet exist
   * (first event ever seen for a vehicle), and bumping `version` +
   * `currentState.lastUpdated` on every write. Concurrent projection
   * writes for the same vehicle are safe under MongoDB's per-document
   * atomicity even without explicit optimistic-lock checks, since every
   * patch is either additive (arrays) or last-write-wins on scalar
   * fields, which is the correct semantic for a read-model projection.
   */
  async applyPatch(
    vehicleId: string,
    license_plate: string,
    tenantId: string,
    patch: Record<string, unknown>,
    eventName: string
  ): Promise<VehicleDigitalTwin> {
    const collection = await this.getCollection();
    const now = new Date();

    const result = await collection.findOneAndUpdate(
      { vehicleId, tenantId, isDeleted: { $ne: true } } as Filter<VehicleDigitalTwin>,
      {
        $set: {
          ...patch,
          vehicleId,
          license_plate,
          tenantId,
          lastEventName: eventName,
          updatedAt: now,
          'currentState.lastUpdated': now,
        },
        $setOnInsert: {
          createdAt: now,
          isDeleted: false,
          alerts: [],
          documents: [],
          tires: [],
        },
        $inc: { version: 1 },
      },
      { upsert: true, returnDocument: 'after' }
    );

    return result as VehicleDigitalTwin;
  }

  async pushAlert(vehicleId: string, tenantId: string, alert: VehicleDigitalTwin['alerts'][number]): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { vehicleId, tenantId, isDeleted: { $ne: true } } as Filter<VehicleDigitalTwin>,
      {
        $push: { alerts: { $each: [alert], $slice: -50 } } as any,
        $set: { updatedAt: new Date() },
        $inc: { version: 1 },
      },
      { upsert: false }
    );
  }

  async acknowledgeAlert(vehicleId: string, tenantId: string, alertId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      { vehicleId, tenantId, 'alerts.id': alertId } as Filter<VehicleDigitalTwin>,
      { $set: { 'alerts.$.acknowledged': true, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async replaceFull(twin: VehicleDigitalTwin, tenantId: string): Promise<VehicleDigitalTwin> {
    const collection = await this.getCollection();
    const now = new Date();
    const { _id, ...rest } = twin;

    const result = await collection.findOneAndUpdate(
      { vehicleId: twin.vehicleId, tenantId } as Filter<VehicleDigitalTwin>,
      {
        $set: { ...rest, tenantId, updatedAt: now, lastRebuiltAt: now },
        $setOnInsert: { createdAt: now, isDeleted: false },
        $inc: { version: 1 },
      },
      { upsert: true, returnDocument: 'after' }
    );

    return result as VehicleDigitalTwin;
  }

  async listFiltered(
    filters: DigitalTwinFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<VehicleDigitalTwin>> {
    const filter: Record<string, unknown> = {};

    if (filters.status) filter['currentState.status'] = filters.status;
    if (filters.hasActiveAlerts) {
      filter['alerts'] = { $elemMatch: { acknowledged: false } };
    }
    if (filters.minSeverity) {
      const minRank = SEVERITY_RANK[filters.minSeverity];
      const qualifying = (Object.keys(SEVERITY_RANK) as TwinAlertSeverity[]).filter(
        (s) => SEVERITY_RANK[s] >= minRank
      );
      filter['alerts'] = {
        $elemMatch: { acknowledged: false, severity: { $in: qualifying } },
      };
    }

    return this.findWithPagination(filter as Filter<VehicleDigitalTwin>, pagination, tenantId);
  }

  async getFleetSummary(tenantId: string): Promise<FleetTwinSummary> {
    const collection = await this.getCollection();
    const baseFilter = this.getActiveFilter(tenantId);

    const pipeline = [
      { $match: baseFilter },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalVehicles: { $sum: 1 },
                averageHealthScore: { $avg: '$currentState.healthScore' },
                overdueMaintenance: {
                  $sum: { $cond: [{ $gt: ['$maintenance.overdueReminders', 0] }, 1, 0] },
                },
                expiredInsurance: {
                  $sum: { $cond: [{ $eq: ['$insurance.status', 'expired'] }, 1, 0] },
                },
              },
            },
          ],
          withActiveAlerts: [
            { $match: { alerts: { $elemMatch: { acknowledged: false } } } },
            { $count: 'count' },
          ],
          criticalAlerts: [
            { $unwind: '$alerts' },
            { $match: { 'alerts.acknowledged': false, 'alerts.severity': 'critical' } },
            { $count: 'count' },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0] || { totals: [], withActiveAlerts: [], criticalAlerts: [] };
    const totals = data.totals[0] || {
      totalVehicles: 0,
      averageHealthScore: 0,
      overdueMaintenance: 0,
      expiredInsurance: 0,
    };

    return {
      totalVehicles: totals.totalVehicles,
      withActiveAlerts: data.withActiveAlerts[0]?.count || 0,
      criticalAlerts: data.criticalAlerts[0]?.count || 0,
      overdueMaintenance: totals.overdueMaintenance,
      expiredInsurance: totals.expiredInsurance,
      averageHealthScore: Math.round(totals.averageHealthScore || 0),
    };
  }
}

export const digitalTwinRepository = new DigitalTwinRepository();