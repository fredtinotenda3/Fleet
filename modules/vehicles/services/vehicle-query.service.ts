// modules/vehicles/services/vehicle-query.service.ts

import { Document } from 'mongodb';
import { queryBus } from '@/server/cqrs/query-bus';
import { GetVehicleByIdQuery } from '../queries/get-vehicle-by-id.query';
import { GetVehicleByLicensePlateQuery } from '../queries/get-vehicle-by-license-plate.query';
import { GetVehiclesQuery } from '../queries/get-vehicles.query';
import { GetVehicleStatsQuery } from '../queries/get-vehicle-stats.query';
import { SearchVehiclesQuery } from '../queries/search-vehicles.query';
import { GetVehiclesByStatusQuery } from '../queries/get-vehicles-by-status.query';
import { GetVehiclesDueForServiceQuery } from '../queries/get-vehicles-due-for-service.query';
import { GetVehicleAnalyticsQuery } from '../queries/get-vehicle-analytics.query';
import {
  Vehicle,
  VehicleFilters,
  VehicleStats,
} from '@/shared/types/vehicle.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

/**
 * Stable facade over the query bus for the Vehicles read side. Mirrors
 * VehicleCommandService's role on the write side.
 */
export class VehicleQueryService {
  async getVehicleById(vehicleId: string, tenantId: string): Promise<Vehicle> {
    return queryBus.execute<Vehicle>(new GetVehicleByIdQuery(vehicleId, tenantId));
  }

  async getVehicleByLicensePlate(
    licensePlate: string,
    tenantId: string
  ): Promise<Vehicle | null> {
    return queryBus.execute<Vehicle | null>(
      new GetVehicleByLicensePlateQuery(licensePlate, tenantId)
    );
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    return queryBus.execute<PaginatedResponse<Vehicle>>(
      new GetVehiclesQuery(filters, pagination, tenantId)
    );
  }

  async getVehicleStats(tenantId: string): Promise<VehicleStats> {
    return queryBus.execute<VehicleStats>(new GetVehicleStatsQuery(tenantId));
  }

  async searchVehicles(
    searchTerm: string,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    return queryBus.execute<PaginatedResponse<Vehicle>>(
      new SearchVehiclesQuery(searchTerm, pagination, tenantId)
    );
  }

  async getVehiclesByStatus(status: string, tenantId: string): Promise<Vehicle[]> {
    return queryBus.execute<Vehicle[]>(
      new GetVehiclesByStatusQuery(status, tenantId)
    );
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string
  ): Promise<Vehicle[]> {
    return queryBus.execute<Vehicle[]>(
      new GetVehiclesDueForServiceQuery(mileageThreshold, tenantId)
    );
  }

  async getVehicleAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Document[]> {
    return queryBus.execute<Document[]>(
      new GetVehicleAnalyticsQuery(tenantId, startDate, endDate)
    );
  }
}

export const vehicleQueryService = new VehicleQueryService();