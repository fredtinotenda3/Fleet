// shared/validations/sso.schema.ts

import { z } from 'zod';

export const ssoConnectionCreateSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100),
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
});

export const ssoConnectionUpdateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  clientSecret: z.string().min(1).optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userinfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  domainHints: z.array(z.string().min(3).max(100)).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  defaultRole: z.string().optional(),
});

export const ssoDiscoverQuerySchema = z.object({
  email: z.string().email('A valid email is required'),
});

export type SsoConnectionCreateInput = z.infer<typeof ssoConnectionCreateSchema>;
export type SsoConnectionUpdateInput = z.infer<typeof ssoConnectionUpdateSchema>;