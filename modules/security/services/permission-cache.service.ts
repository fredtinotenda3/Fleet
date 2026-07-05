// modules/security/services/permission-cache.service.ts

import { cacheService } from '@/infrastructure/cache/cache.service';
import { PermissionDecision, PermissionCheckParams } from '../types/resource-permission.types';

const CACHE_PREFIX = 'perm';
const CACHE_TTL_SECONDS = 30;

function buildCacheKey(params: PermissionCheckParams): string {
  const resource = params.resource;
  const resourceKey = resource
    ? `${resource.type}:${resource.id || '*'}:${resource.orgUnitId || '*'}`
    : '*:*:*';
  return `${CACHE_PREFIX}:${params.tenantId}:${params.userId}:${params.permission}:${resourceKey}`;
}

/**
 * Short-TTL cache for computed PermissionDecisions, backed by the shared
 * cacheService (Redis when REDIS_URL is configured, in-memory otherwise).
 * The TTL alone bounds staleness; explicit invalidation (see
 * PermissionCacheInvalidationHandler) keeps role/grant changes from
 * waiting out the full TTL before taking effect.
 */
export class PermissionCacheService {
  async get(params: PermissionCheckParams): Promise<PermissionDecision | null> {
    const key = buildCacheKey(params);
    return cacheService.get<PermissionDecision>(key);
  }

  async set(params: PermissionCheckParams, decision: PermissionDecision): Promise<void> {
    const key = buildCacheKey(params);
    await cacheService.set(key, decision, { ttl: CACHE_TTL_SECONDS });
  }

  async invalidateUser(tenantId: string, userId: string): Promise<void> {
    await cacheService.deletePattern(`${CACHE_PREFIX}:${tenantId}:${userId}:*`);
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await cacheService.deletePattern(`${CACHE_PREFIX}:${tenantId}:*`);
  }

  /** Used by batch jobs (e.g. expire-grants) that can span multiple tenants in one pass. */
  async invalidateAll(): Promise<void> {
    await cacheService.deletePattern(`${CACHE_PREFIX}:*`);
  }
}

export const permissionCacheService = new PermissionCacheService();