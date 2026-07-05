// modules/oauth/types/oauth-token.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type OAuthTokenType = 'access_token' | 'refresh_token';
export type OAuthTokenStatus = 'active' | 'revoked' | 'expired';
export type OAuthGrantType = 'client_credentials' | 'refresh_token' | 'authorization_code';

export interface OAuthToken extends BaseEntity {
  clientId: string;
  userId?: string;
  tokenHash: string;
  tokenType: OAuthTokenType;
  scopes: string[];
  status: OAuthTokenStatus;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface OAuthTokenRequest {
  grantType: OAuthGrantType;
  clientId: string;
  clientSecret: string;
  scope?: string;
  redirectUri?: string;
  code?: string;
  refreshToken?: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
}

export interface OAuthAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: 'code';
  scope?: string;
  state?: string;
}

export interface OAuthAuthorizationResponse {
  code: string;
  state?: string;
}

export interface OAuthIntrospectionRequest {
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
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