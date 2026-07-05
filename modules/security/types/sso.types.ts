// modules/security/types/sso.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type SsoProviderType = 'oidc';
export type SsoConnectionStatus = 'active' | 'inactive';

export interface SsoConnection extends BaseEntity {
  organizationId: string;
  provider: SsoProviderType;
  displayName: string;
  issuer: string;
  clientId: string;
  /** Envelope-encrypted (EncryptionService) OAuth client secret. */
  clientSecretEncrypted: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes: string[];
  /** Email domains (e.g. "acme.com") that should be routed to this connection. */
  domainHints: string[];
  status: SsoConnectionStatus;
  defaultRole: string;
}

export interface SsoConnectionCreateDTO {
  organizationId: string;
  displayName: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes?: string[];
  domainHints: string[];
  defaultRole?: string;
}

export interface SsoConnectionUpdateDTO {
  displayName?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopes?: string[];
  domainHints?: string[];
  status?: SsoConnectionStatus;
  defaultRole?: string;
}

/** Public-safe projection returned to the pre-login discovery endpoint. */
export interface SsoDiscoveryResult {
  ssoAvailable: boolean;
  connectionId?: string;
  displayName?: string;
}