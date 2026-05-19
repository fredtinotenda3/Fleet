// infrastructure/cache/query-cache.service.ts

import { cacheService } from './cache.service';

export class QueryCacheService {
  private readonly DEFAULT_TTL = 60; // 1 minute
  private readonly AGGREGATION_TTL = 300; // 5 minutes
  
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const cached = await cacheService.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const data = await fetcher();
    await cacheService.set(key, data, { ttl });
    return data;
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    await cacheService.deletePattern(pattern);
  }
  
  async invalidateDashboard(tenantId: string): Promise<void> {
    await cacheService.deletePattern(`dashboard:${tenantId}:*`);
  }
  
  async invalidateAnalytics(tenantId: string, type: string): Promise<void> {
    await cacheService.deletePattern(`analytics:${tenantId}:${type}:*`);
  }
  
  async invalidateVehicle(tenantId: string, vehicleId: string): Promise<void> {
    await cacheService.deletePattern(`vehicle:${tenantId}:${vehicleId}:*`);
    await cacheService.deletePattern(`vehicles:${tenantId}:*`);
  }
  
  async getDashboardKPIs(tenantId: string, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`dashboard:${tenantId}:kpis`, fetcher, this.AGGREGATION_TTL);
  }
  
  async getVehicleAnalytics(tenantId: string, vehicleId: string, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`vehicle:${tenantId}:${vehicleId}:analytics`, fetcher, this.AGGREGATION_TTL);
  }
  
  async getFleetSummary(tenantId: string, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`fleet:${tenantId}:summary`, fetcher, this.AGGREGATION_TTL);
  }
}

export const queryCache = new QueryCacheService();