// modules/oauth/types/oauth-client.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type OAuthClientStatus = 'active' | 'suspended' | 'revoked';
export type OAuthGrantType = 'client_credentials' | 'authorization_code' | 'refresh_token';
export type OAuthScope = string;

export interface OAuthClient extends BaseEntity {
  organizationId: string;
  clientId: string;
  clientSecretHash: string;
  clientSecretPreview: string; // Last 4 chars + prefix for display
  name: string;
  description?: string;
  redirectUris: string[];
  allowedGrantTypes: OAuthGrantType[];
  scopes: OAuthScope[];
  status: OAuthClientStatus;
  expiresAt?: Date;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface OAuthClientCreateDTO {
  name: string;
  description?: string;
  redirectUris?: string[];
  allowedGrantTypes?: OAuthGrantType[];
  scopes?: OAuthScope[];
  expiresAt?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface OAuthClientUpdateDTO {
  name?: string;
  description?: string;
  redirectUris?: string[];
  allowedGrantTypes?: OAuthGrantType[];
  scopes?: OAuthScope[];
  status?: OAuthClientStatus;
  expiresAt?: Date | string | null;
  metadata?: Record<string, unknown>;
}

export interface OAuthClientCreateResult {
  client: Omit<OAuthClient, 'clientSecretHash'>;
  clientSecret: string; // Only returned once, at creation
}

export interface OAuthTokenIntrospection {
  active: boolean;
  clientId?: string;
  userId?: string;
  scopes?: string[];
  exp?: number;
  iat?: number;
  sub?: string;
}