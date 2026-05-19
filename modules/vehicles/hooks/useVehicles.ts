// C:\Users\user\Desktop\Fleet\modules\vehicles\hooks\useVehicles.ts

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { vehiclesApi } from '../api/vehicles.api';
import { Vehicle, VehicleFilters, VehicleStats } from '@/shared/types/vehicle.types';
import { PaginatedResponse } from '@/shared/types/common.types';
import { queryKeys } from '@/shared/config/react-query';

export const useVehicles = (
  filters: VehicleFilters = {},
  page: number = 1,
  limit: number = 10,
  options?: Omit<UseQueryOptions<PaginatedResponse<Vehicle>>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: queryKeys.vehicles.list({ filters, page, limit }),
    queryFn: async () => {
      console.log('Fetching vehicles with:', { filters, page, limit });
      const result = await vehiclesApi.getVehicles(filters, page, limit);
      console.log('Vehicles API response:', result);
      return result;
    },
    staleTime: 0, // Changed from 30 seconds to 0 to always refetch
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    ...options,
  });
};

export const useVehicle = (id: string, options?: Omit<UseQueryOptions<Vehicle>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(id),
    queryFn: () => vehiclesApi.getVehicleById(id),
    enabled: !!id,
    ...options,
  });
};

export const useVehicleByLicensePlate = (
  licensePlate: string,
  options?: Omit<UseQueryOptions<Vehicle | null>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: queryKeys.vehicles.byLicensePlate(licensePlate),
    queryFn: () => vehiclesApi.getVehicleByLicensePlate(licensePlate),
    enabled: !!licensePlate,
    ...options,
  });
};

export const useVehicleStats = (options?: Omit<UseQueryOptions<VehicleStats>, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: queryKeys.vehicles.stats(),
    queryFn: async () => {
      console.log('Fetching vehicle stats...');
      const result = await vehiclesApi.getVehicleStats();
      console.log('Vehicle stats response:', result);
      return result;
    },
    staleTime: 0, // Always refetch
    refetchOnMount: true,
    ...options,
  });
};

export const useVehicleSearch = (
  query: string,
  page: number = 1,
  limit: number = 10,
  options?: Omit<UseQueryOptions<PaginatedResponse<Vehicle>>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: [...queryKeys.vehicles.lists(), 'search', query, page, limit],
    queryFn: () => vehiclesApi.searchVehicles(query, page, limit),
    enabled: query.length >= 2,
    ...options,
  });
};

export const useVehiclesByStatus = (
  status: string,
  options?: Omit<UseQueryOptions<Vehicle[]>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: [...queryKeys.vehicles.lists(), 'status', status],
    queryFn: () => vehiclesApi.getVehiclesByStatus(status),
    ...options,
  });
};

export const useVehiclesDueForService = (
  threshold: number = 10000,
  options?: Omit<UseQueryOptions<Vehicle[]>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: [...queryKeys.vehicles.lists(), 'due-service', threshold],
    queryFn: () => vehiclesApi.getVehiclesDueForService(threshold),
    ...options,
  });
};

export const useVehicleAnalytics = (
  startDate: Date,
  endDate: Date,
  options?: Omit<UseQueryOptions<any[]>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: queryKeys.vehicles.analytics(startDate, endDate),
    queryFn: () => vehiclesApi.getVehicleAnalytics(startDate, endDate),
    ...options,
  });
};