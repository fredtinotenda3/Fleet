// C:\Users\user\Desktop\Fleet\modules\vehicles\api\vehicles.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { Vehicle, VehicleCreateDTO, VehicleUpdateDTO, VehicleFilters, VehicleStats } from '@/shared/types/vehicle.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/vehicles';

export const vehiclesApi = {
  async getVehicles(filters: VehicleFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Vehicle>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.make && { make: filters.make }),
      ...(filters.model && { model: filters.model }),
      ...(filters.status && { status: filters.status }),
      ...(filters.year && { year: filters.year }),
      ...(filters.vehicle_type && { vehicle_type: filters.vehicle_type }),
    };
    
    const response = await apiClient.get<PaginatedResponse<Vehicle>>(BASE_URL, { params });
    console.log('vehiclesApi.getVehicles raw response:', response);
    return response;
  },

  async getVehicleById(id: string): Promise<Vehicle> {
    return apiClient.get<Vehicle>(BASE_URL, { params: { id } });
  },

  async getVehicleByLicensePlate(licensePlate: string): Promise<Vehicle | null> {
    try {
      return await apiClient.get<Vehicle>(BASE_URL, { params: { license_plate: licensePlate } });
    } catch (error) {
      if ((error as any)?.statusCode === 404) return null;
      throw error;
    }
  },

  async getVehicleStats(): Promise<VehicleStats> {
    const response = await apiClient.get<VehicleStats>(BASE_URL, { params: { action: 'stats' } });
    console.log('vehiclesApi.getVehicleStats response:', response);
    return response;
  },

  async searchVehicles(query: string, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Vehicle>> {
    return apiClient.get<PaginatedResponse<Vehicle>>(BASE_URL, {
      params: { action: 'search', q: query, page, limit },
    });
  },

  async getVehiclesByStatus(status: string): Promise<Vehicle[]> {
    return apiClient.get<Vehicle[]>(BASE_URL, { params: { action: 'by-status', status } });
  },

  async getVehiclesDueForService(threshold: number = 10000): Promise<Vehicle[]> {
    return apiClient.get<Vehicle[]>(BASE_URL, { params: { action: 'due-service', threshold } });
  },

  async getVehicleAnalytics(startDate: Date, endDate: Date): Promise<any[]> {
    return apiClient.get<any[]>(BASE_URL, {
      params: { action: 'analytics', startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  },

  async createVehicle(data: VehicleCreateDTO): Promise<Vehicle> {
    return apiClient.post<Vehicle>(BASE_URL, data);
  },

  async updateVehicle(id: string, data: VehicleUpdateDTO): Promise<Vehicle> {
    return apiClient.put<Vehicle>(BASE_URL, data, { params: { id } });
  },

  async updateVehicleStatus(id: string, status: Vehicle['status']): Promise<Vehicle> {
    return apiClient.put<Vehicle>(BASE_URL, { status }, { params: { id, action: 'status' } });
  },

  async deleteVehicle(id: string, soft: boolean = true): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id, soft } });
  },
};

export default vehiclesApi;