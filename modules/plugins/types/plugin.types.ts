// modules/plugins/types/plugin.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type PluginCapabilityType =
  | 'action'          // callable side-effecting capability (mirrors RuleActionRegistry entries)
  | 'trigger'         // subscribes to domain/webhook events and emits into the plugin
  | 'data_provider'   // read-only data source exposed to reports/dashboards
  | 'auth_provider';  // OAuth/identity provider (Phase 10d)

export type PluginStatus = 'active' | 'disabled' | 'error' | 'pending_config';

/**
 * The manifest is the plugin's static contract: what it declares it can do,
 * and what it needs. This is provider-authored (bundled with the plugin
 * package or registered by platform staff for first-party integrations),
 * distinct from PluginInstallation which is the per-organization runtime
 * record (Phase 10a's `tblplugininstallations`).
 */
export interface PluginManifest {
  /** Globally unique, stable identifier, e.g. "quickbooks", "slack", "sap-erp". */
  pluginId: string;
  name: string;
  description: string;
  version: string; // semver
  publisher: string;
  /** Capability keys this plugin exposes, resolved against PluginCapabilityRegistry at load time. */
  capabilities: PluginManifestCapability[];
  /** Platform permission keys (see server/permissions/roles.ts + PermissionRegistry) the plugin
   *  needs granted to the organization installing it before it can activate. */
  requiredScopes: string[];
  /** JSON-schema-lite description of config fields an admin must fill in before activation. */
  configSchema: PluginConfigField[];
  /** Domain/webhook event names (see server/events/event-names.ts) this plugin wants delivered to it. */
  subscribedEvents?: string[];
  /** URL the plugin's own webhook engine should be reachable at, for outbound event delivery (Phase 10b). */
  webhookUrl?: string;
  icon?: string;
  homepageUrl?: string;
}

export interface PluginManifestCapability {
  key: string; // must match a key registered in PluginCapabilityRegistry
  type: PluginCapabilityType;
  label: string;
  description?: string;
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'secret' | 'select';
  required: boolean;
  options?: string[]; // for 'select'
  defaultValue?: unknown;
}

/**
 * Per-organization installation record. `config` holds admin-supplied
 * values validated against the manifest's configSchema; secret-typed
 * fields are stored envelope-encrypted (see infrastructure/secrets/encryption.service.ts),
 * mirroring how SsoConnection.clientSecretEncrypted works.
 */
export interface PluginInstallation extends BaseEntity {
  organizationId: string;
  pluginId: string;
  manifestVersion: string;
  status: PluginStatus;
  config: Record<string, unknown>;
  grantedScopes: string[];
  installedBy: string;
  lastError?: string;
  lastActiveAt?: Date;
}

export interface PluginInstallCreateDTO {
  pluginId: string;
  config?: Record<string, unknown>;
}

export interface PluginInstallUpdateDTO {
  config?: Record<string, unknown>;
  status?: PluginStatus;
}

/** Registered (available-to-install) plugin, distinct from an org's installation of it. */
export interface RegisteredPlugin extends BaseEntity {
  pluginId: string;
  manifest: PluginManifest;
  isSystemPlugin: boolean; // true for first-party integrations platform staff registered
  status: 'published' | 'deprecated' | 'draft';
}