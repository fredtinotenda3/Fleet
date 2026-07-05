// modules/security/types/api-key.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * `permissions` is a raw string array rather than `Permission[]` on
 * purpose, mirroring how CustomRole.customPermissionKeys is modeled
 * elsewhere in the security module: an API key may be granted either a
 * static Permission enum member or a dynamic key registered in
 * PermissionRegistry, and validity is checked against both at creation
 * time in ApiKeyService rather than at the type level.
 */
export interface ApiKey extends BaseEntity {
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  status: ApiKeyStatus;
  createdByUserId: string;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  expiresAt?: Date | null;
  revokedAt?: Date;
  revokedBy?: string;
  revokedReason?: string;
}

export interface ApiKeyCreateDTO {
  name: string;
  permissions: string[];
  expiresAt?: string | Date | null;
}

export interface ApiKeyCreateResult {
  apiKey: Omit<ApiKey, 'keyHash'>;
  plaintextKey: string;
}