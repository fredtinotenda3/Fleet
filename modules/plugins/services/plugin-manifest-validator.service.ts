// modules/plugins/services/plugin-manifest-validator.service.ts

import { PluginManifest } from '../types/plugin.types';
import { pluginCapabilityRegistry } from '../registry/PluginCapabilityRegistry';
import { permissionRegistry } from '@/modules/security/registry/PermissionRegistry';
import { bootstrapPermissionRegistry } from '@/modules/security/registry/bootstrap-permission-registry';
import { ValidationError } from '@/server/errors/app.errors';

bootstrapPermissionRegistry();

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * Structural + referential validation for a plugin manifest, run at both
 * registration time (platform staff registering a new integration into
 * the catalogue) and activation time (an org enabling an already-installed
 * plugin, in case the manifest was updated since install). Referential
 * checks â€” does every declared capability key actually have a registered
 * handler, does every requiredScope exist as a known permission â€” are
 * exactly the kind of check RuleEngineService.validateConditionGroup()
 * does for rule condition trees: catch a broken contract before runtime,
 * not during a live capability execution.
 */
export class PluginManifestValidatorService {
  validate(manifest: PluginManifest): void {
    const errors: string[] = [];

    if (!PLUGIN_ID_RE.test(manifest.pluginId)) {
      errors.push(
        `pluginId "${manifest.pluginId}" must be lowercase alphanumeric with hyphens, 2-64 chars`
      );
    }
    if (!manifest.name?.trim()) errors.push('name is required');
    if (!SEMVER_RE.test(manifest.version)) {
      errors.push(`version "${manifest.version}" is not valid semver (e.g. "1.0.0")`);
    }
    if (!manifest.publisher?.trim()) errors.push('publisher is required');

    if (!manifest.capabilities || manifest.capabilities.length === 0) {
      errors.push('At least one capability must be declared');
    } else {
      const seen = new Set<string>();
      for (const cap of manifest.capabilities) {
        if (!cap.key) {
          errors.push('Every capability must declare a key');
          continue;
        }
        if (seen.has(cap.key)) {
          errors.push(`Duplicate capability key "${cap.key}"`);
        }
        seen.add(cap.key);

        if (!pluginCapabilityRegistry.isRegistered(cap.key)) {
          errors.push(
            `Capability "${cap.key}" has no registered handler in PluginCapabilityRegistry. ` +
              `Register it before publishing this manifest.`
          );
        }
      }
    }

    for (const scope of manifest.requiredScopes || []) {
      if (!permissionRegistry.isRegistered(scope)) {
        errors.push(`requiredScopes references unknown permission key "${scope}"`);
      }
    }

    for (const field of manifest.configSchema || []) {
      if (!field.key) errors.push('Every configSchema field must declare a key');
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        errors.push(`configSchema field "${field.key}" is type 'select' but declares no options`);
      }
    }

    if (manifest.webhookUrl) {
      try {
        const url = new URL(manifest.webhookUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('webhookUrl must be http(s)');
        }
      } catch {
        errors.push('webhookUrl is not a valid URL');
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`Invalid plugin manifest for "${manifest.pluginId}"`, errors);
    }
  }

  /** Validates admin-supplied config values against the manifest's configSchema. */
  validateConfig(manifest: PluginManifest, config: Record<string, unknown>): void {
    const errors: string[] = [];

    for (const field of manifest.configSchema) {
      const value = config[field.key];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Config field "${field.key}" is required`);
        continue;
      }
      if (value === undefined || value === null) continue;

      switch (field.type) {
        case 'number':
          if (typeof value !== 'number') errors.push(`Config field "${field.key}" must be a number`);
          break;
        case 'boolean':
          if (typeof value !== 'boolean') errors.push(`Config field "${field.key}" must be a boolean`);
          break;
        case 'select':
          if (typeof value !== 'string' || !(field.options || []).includes(value)) {
            errors.push(`Config field "${field.key}" must be one of: ${(field.options || []).join(', ')}`);
          }
          break;
        case 'string':
        case 'secret':
          if (typeof value !== 'string') errors.push(`Config field "${field.key}" must be a string`);
          break;
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`Invalid plugin configuration for "${manifest.pluginId}"`, errors);
    }
  }

  secretFieldKeys(manifest: PluginManifest): string[] {
    return manifest.configSchema.filter((f) => f.type === 'secret').map((f) => f.key);
  }
}

export const pluginManifestValidatorService = new PluginManifestValidatorService();