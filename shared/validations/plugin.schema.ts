// shared/validations/plugin.schema.ts

import { z } from 'zod';

export const pluginCapabilityTypeSchema = z.enum(['action', 'trigger', 'data_provider', 'auth_provider']);

export const pluginManifestCapabilitySchema = z.object({
  key: z.string().min(1, 'Capability key is required'),
  type: pluginCapabilityTypeSchema,
  label: z.string().min(1, 'Capability label is required').max(100),
  description: z.string().max(500).optional(),
});

export const pluginConfigFieldSchema = z.object({
  key: z.string().min(1, 'Config field key is required'),
  label: z.string().min(1, 'Config field label is required').max(100),
  type: z.enum(['string', 'number', 'boolean', 'secret', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
});

const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'Version must be valid semver (e.g. "1.0.0")');

const pluginIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'pluginId must be lowercase alphanumeric with hyphens, 2-64 chars');

export const pluginManifestSchema = z.object({
  pluginId: pluginIdSchema,
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(1000),
  version: semverSchema,
  publisher: z.string().min(1, 'Publisher is required').max(100),
  capabilities: z.array(pluginManifestCapabilitySchema).min(1, 'At least one capability must be declared'),
  requiredScopes: z.array(z.string()).default([]),
  configSchema: z.array(pluginConfigFieldSchema).default([]),
  subscribedEvents: z.array(z.string()).optional(),
  webhookUrl: z.string().url('webhookUrl must be a valid URL').optional(),
  icon: z.string().url().optional(),
  homepageUrl: z.string().url().optional(),
});

export const pluginRegisterSchema = z.object({
  manifest: pluginManifestSchema,
  isSystemPlugin: z.boolean().default(false),
});

export const pluginInstallCreateSchema = z.object({
  pluginId: pluginIdSchema,
  config: z.record(z.string(), z.unknown()).optional(),
});

export const pluginInstallUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['active', 'disabled', 'error', 'pending_config']).optional(),
});

export type PluginManifestInput = z.infer<typeof pluginManifestSchema>;
export type PluginRegisterInput = z.infer<typeof pluginRegisterSchema>;
export type PluginInstallCreateInput = z.infer<typeof pluginInstallCreateSchema>;
export type PluginInstallUpdateInput = z.infer<typeof pluginInstallUpdateSchema>;