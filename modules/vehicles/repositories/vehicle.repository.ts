// C:\Users\user\Desktop\Fleet\modules\vehicles\repositories\vehicle.repository.ts

import { Filter, Document } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Vehicle, VehicleFilters, VehicleStats } from '@/shared/types/vehicle.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class VehicleRepository extends BaseRepository<Vehicle> {
  protected collectionName = 'tblvehicles';

  // Helper to check if user is super admin (can be passed from service layer)
  private async isSuperAdmin(tenantId: string): Promise<boolean> {
    // tenantId === 'default' or we can check from token
    // For now, treat 'default' as super admin tenant
    return tenantId === 'default' || tenantId === 'system';
  }

  async findByLicensePlate(licensePlate: string, tenantId: string, isSuperAdmin: boolean = false): Promise<Vehicle | null> {
    return this.findOne({ license_plate: licensePlate.toUpperCase() }, tenantId, false, isSuperAdmin);
  }

  async findByLicensePlates(licensePlates: string[], tenantId: string, isSuperAdmin: boolean = false): Promise<Vehicle[]> {
    return this.findMany({ license_plate: { $in: licensePlates.map(p => p.toUpperCase()) } }, tenantId, {}, false, isSuperAdmin);
  }

  async searchVehicles(
    searchTerm: string,
    tenantId: string,
    pagination: PaginationParams,
    isSuperAdmin: boolean = false
  ): Promise<PaginatedResponse<Vehicle>> {
    const filter: Filter<Vehicle> = {
      $or: [
        { license_plate: { $regex: searchTerm, $options: 'i' } },
        { make: { $regex: searchTerm, $options: 'i' } },
        { model: { $regex: searchTerm, $options: 'i' } },
        { vin: { $regex: searchTerm, $options: 'i' } },
      ],
    };
    return this.findWithPagination(filter, pagination, tenantId, false, isSuperAdmin);
  }

  async getFilteredVehiclesOptimized(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    
    // Build efficient query with covered indexes
    const query: any = {
      isDeleted: { $ne: true },
    };
    
    // Only add tenant filter if NOT super admin
    if (!isSuperAdmin && tenantId && tenantId !== 'default') {
      query.tenantId = tenantId;
    }
    
    if (filters.license_plate) {
      query.license_plate = { $regex: `^${filters.license_plate}`, $options: 'i' };
    }
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.make) {
      query.make = { $regex: `^${filters.make}`, $options: 'i' };
    }
    
    if (filters.model) {
      query.model = { $regex: `^${filters.model}`, $options: 'i' };
    }
    
    // Project only needed fields for performance
    const projection = {
      _id: 1,
      license_plate: 1,
      make: 1,
      model: 1,
      year: 1,
      status: 1,
      color: 1,
      fuel_type: 1,
      vehicle_type: 1,
      purchase_date: 1,
      odometer: 1,
      vin: 1,
      createdAt: 1,
      tenantId: 1,
    };
    
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    
    const [data, total] = await Promise.all([
      collection
        .find(query)
        .project(projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);
    
    console.log(`📊 Vehicle query: ${total} total vehicles found (isSuperAdmin: ${isSuperAdmin})`);
    
    return {
      data: data as unknown as Vehicle[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    tenantId: string,
    pagination: PaginationParams,
    isSuperAdmin: boolean = false
  ): Promise<PaginatedResponse<Vehicle>> {
    return this.getFilteredVehiclesOptimized(filters, pagination, tenantId, isSuperAdmin);
  }

  async getVehicleStats(tenantId: string, isSuperAdmin: boolean = false): Promise<VehicleStats> {
    const collection = await this.getCollection();
    
    // Build filter based on admin status
    const baseFilter: any = { isDeleted: { $ne: true } };
    if (!isSuperAdmin && tenantId && tenantId !== 'default') {
      baseFilter.tenantId = tenantId;
    }
    
    const [total, active, inactive, maintenance] = await Promise.all([
      collection.countDocuments(baseFilter),
      collection.countDocuments({ ...baseFilter, status: 'active' }),
      collection.countDocuments({ ...baseFilter, status: 'inactive' }),
      collection.countDocuments({ ...baseFilter, status: 'maintenance' }),
    ]);
    
    console.log(`📊 Vehicle stats: total=${total}, active=${active}, inactive=${inactive}, maintenance=${maintenance}`);

    return { total, active, inactive, maintenance };
  }

  async getVehiclesByStatus(status: string, tenantId: string, isSuperAdmin: boolean = false): Promise<Vehicle[]> {
    return this.findMany({ status }, tenantId, {}, false, isSuperAdmin);
  }

  async getVehiclesWithRecentActivity(
    days: number,
    tenantId: string,
    limit: number = 10,
    isSuperAdmin: boolean = false
  ): Promise<Vehicle[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filter: any = {};
    if (!isSuperAdmin && tenantId && tenantId !== 'default') {
      filter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: { ...filter, isDeleted: { $ne: true } } },
      {
        $lookup: {
          from: 'tblexpenses',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: cutoffDate },
              },
            },
            { $limit: 1 },
          ],
          as: 'recent_expense',
        },
      },
      {
        $lookup: {
          from: 'tblfuellogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: cutoffDate },
              },
            },
            { $limit: 1 },
          ],
          as: 'recent_fuel',
        },
      },
      {
        $match: {
          $or: [
            { 'recent_expense.0': { $exists: true } },
            { 'recent_fuel.0': { $exists: true } },
          ],
        },
      },
      { $limit: limit },
    ];

    const collection = await this.getCollection();
    return collection.aggregate<Vehicle>(pipeline).toArray();
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<Vehicle[]> {
    const collection = await this.getCollection();
    
    const baseFilter: any = { isDeleted: { $ne: true } };
    if (!isSuperAdmin && tenantId && tenantId !== 'default') {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblmeterlogs',
          let: { plate: '$license_plate' },
          pipeline: [
            { $match: { $expr: { $eq: ['$license_plate', '$$plate'] } } },
            { $sort: { date: -1 } },
            { $limit: 1 },
            { $project: { odometer: 1 } },
          ],
          as: 'latest_meter',
        },
      },
      {
        $addFields: {
          currentOdometer: { $ifNull: [{ $arrayElemAt: ['$latest_meter.odometer', 0] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [
              { $subtract: ['$currentOdometer', { $ifNull: ['$last_service_odometer', 0] }] },
              mileageThreshold,
            ],
          },
        },
      },
    ];

    return collection.aggregate<Vehicle>(pipeline).toArray();
  }

  async getVehicleAnalytics(tenantId: string, startDate: Date, endDate: Date, isSuperAdmin: boolean = false): Promise<Document[]> {
    const collection = await this.getCollection();
    
    const baseFilter: any = { isDeleted: { $ne: true } };
    if (!isSuperAdmin && tenantId && tenantId !== 'default') {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblexpenses',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          as: 'expense_total',
        },
      },
      {
        $lookup: {
          from: 'tblfuellogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            { $group: { _id: null, totalFuel: { $sum: '$fuel_volume' }, totalCost: { $sum: '$cost' } } },
          ],
          as: 'fuel_stats',
        },
      },
      {
        $addFields: {
          totalExpenses: { $ifNull: [{ $arrayElemAt: ['$expense_total.total', 0] }, 0] },
          totalFuelCost: { $ifNull: [{ $arrayElemAt: ['$fuel_stats.totalCost', 0] }, 0] },
          totalFuelVolume: { $ifNull: [{ $arrayElemAt: ['$fuel_stats.totalFuel', 0] }, 0] },
        },
      },
      {
        $project: {
          _id: 1,
          license_plate: 1,
          make: 1,
          model: 1,
          year: 1,
          status: 1,
          totalExpenses: 1,
          totalFuelCost: 1,
          totalFuelVolume: 1,
          totalOperatingCost: { $add: ['$totalExpenses', '$totalFuelCost'] },
        },
      },
      { $sort: { totalOperatingCost: -1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }
}

export const vehicleRepository = new VehicleRepository();