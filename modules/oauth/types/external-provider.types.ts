// modules/oauth/types/external-provider.types.ts

import { BaseEntity } from '@/shared/types/common.types';

// Provider types
export type ExternalProviderType = 'oidc' | 'saml' | 'oauth2';
export type ExternalProviderStatus = 'active' | 'inactive' | 'suspended' | 'error' | 'deprecated';

// Main External Provider entity
export interface ExternalProvider extends BaseEntity {
  organizationId: string;
  providerId: string;
  type: ExternalProviderType;
  name: string;
  description?: string;
  issuer: string;
  clientId: string;
  clientSecretEncrypted: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes: string[];
  domainHints: string[];
  status: ExternalProviderStatus;
  defaultRole: string;
  metadata?: Record<string, unknown>;
  wellKnownConfig?: Record<string, unknown> | null;
}

// DTO for creating a new external provider
export interface ExternalProviderCreateDTO {
  name: string;
  type: ExternalProviderType;
  issuer: string;
  clientId: string;
  clientSecret: string;
  description?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes?: string[];
  domainHints: string[];
  defaultRole?: string;
  metadata?: Record<string, unknown>;
}

// DTO for updating an existing external provider
export interface ExternalProviderUpdateDTO {
  name?: string;
  description?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes?: string[];
  domainHints?: string[];
  status?: ExternalProviderStatus;
  defaultRole?: string;
  metadata?: Record<string, unknown>;
}

// Discovery result for email-based provider lookup
export interface ExternalProviderDiscoveryResult {
  available: boolean;
  providerId?: string;
  name?: string;
  type?: ExternalProviderType;
  loginHint?: string;
}