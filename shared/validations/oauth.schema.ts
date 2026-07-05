// shared/validations/oauth.schema.ts

import { z } from 'zod';

// ─── OAuth Client ────────────────────────────────────────────────────────────

export const oauthClientCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url('Must be a valid URL')).max(10).optional(),
  allowedGrantTypes: z
    .array(z.enum(['client_credentials', 'authorization_code', 'refresh_token']))
    .default(['client_credentials']),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.union([z.string().datetime(), z.date()]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const oauthClientUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url()).max(10).optional(),
  allowedGrantTypes: z
    .array(z.enum(['client_credentials', 'authorization_code', 'refresh_token']))
    .optional(),
  scopes: z.array(z.string()).optional(),
  status: z.enum(['active', 'suspended', 'revoked']).optional(),
  expiresAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── OAuth Token ─────────────────────────────────────────────────────────────

export const oauthTokenRequestSchema = z.object({
  grantType: z.enum(['client_credentials', 'refresh_token']),
  clientId: z.string().min(1, 'clientId is required'),
  clientSecret: z.string().min(1, 'clientSecret is required'),
  scope: z.string().optional(),
  refreshToken: z.string().optional(),
});

export const oauthIntrospectionRequestSchema = z.object({
  token: z.string().min(1, 'token is required'),
  tokenTypeHint: z.enum(['access_token', 'refresh_token']).optional(),
});

// ─── External Provider ──────────────────────────────────────────────────────

export const externalProviderCreateSchema = z.object({
  type: z.enum(['oidc', 'saml', 'oauth2']),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  issuer: z.string().url('Issuer must be a valid URL'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userinfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  domainHints: z.array(z.string().min(3).max(100)).min(1, 'At least one domain is required'),
  defaultRole: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const externalProviderUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  issuer: z.string().url().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userinfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  domainHints: z.array(z.string().min(3).max(100)).optional(),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  defaultRole: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type OAuthClientCreateInput = z.infer<typeof oauthClientCreateSchema>;
export type OAuthClientUpdateInput = z.infer<typeof oauthClientUpdateSchema>;
export type OAuthTokenRequestInput = z.infer<typeof oauthTokenRequestSchema>;
export type ExternalProviderCreateInput = z.infer<typeof externalProviderCreateSchema>;
export type ExternalProviderUpdateInput = z.infer<typeof externalProviderUpdateSchema>;