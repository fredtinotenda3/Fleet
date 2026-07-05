// modules/plugins/services/plugin.service.ts

import { pluginRepository, PluginRepository } from '../repositories/plugin.repository';
import {
  pluginInstallationRepository,
  PluginInstallationRepository,
} from '../repositories/plugin-installation.repository';
import { pluginManifestValidatorService, PluginManifestValidatorService } from './plugin-manifest-validator.service';
import {
  PluginInstallation,
  PluginInstallCreateDTO,
  PluginInstallUpdateDTO,
  PluginManifest,
  RegisteredPlugin,
} from '../types/plugin.types';
import { encryptSecretFields } from '../sdk/plugin-sdk';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { PluginInstalledEvent } from '../events/PluginInstalledEvent';
import { PluginUpdatedEvent } from '../events/PluginUpdatedEvent';
import { PluginUninstalledEvent } from '../events/PluginUninstalledEvent';
import { PLUGIN_ENABLED, PLUGIN_DISABLED } from '../events/event-names';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';

export class PluginService {
  constructor(
    private readonly catalogueRepo: PluginRepository = pluginRepository,
    private readonly installRepo: PluginInstallationRepository = pluginInstallationRepository,
    private readonly validator: PluginManifestValidatorService = pluginManifestValidatorService
  ) {}

  // ─── Catalogue (platform staff / first-party registration) ──────────

  async registerPlugin(manifest: PluginManifest, isSystemPlugin: boolean, userId: string): Promise<RegisteredPlugin> {
    this.validator.validate(manifest);

    const existing = await this.catalogueRepo.findByPluginId(manifest.pluginId);
    if (existing) {
      throw new ConflictError(`A plugin with id "${manifest.pluginId}" is already registered`);
    }

    const created = await this.catalogueRepo.create(
      { pluginId: manifest.pluginId, manifest, isSystemPlugin, status: 'published' },
      'system',
      userId
    );

    await auditLog.log({
      action: 'PLUGIN_REGISTERED',
      userId,
      tenantId: 'system',
      entityType: 'plugin',
      entityId: created._id,
      metadata: { pluginId: manifest.pluginId, version: manifest.version },
    });

    return created;
  }

  async listCatalogue(): Promise<RegisteredPlugin[]> {
    return this.catalogueRepo.listPublished();
  }

  async getManifest(pluginId: string): Promise<RegisteredPlugin> {
    const plugin = await this.catalogueRepo.findByPluginId(pluginId);
    if (!plugin) throw new NotFoundError(`Plugin "${pluginId}" not found in catalogue`);
    return plugin;
  }

  // ─── Per-organization installation lifecycle ─────────────────────

  async install(
    data: PluginInstallCreateDTO,
    organizationId: string,
    userId: string
  ): Promise<PluginInstallation> {
    const registered = await this.getManifest(data.pluginId);

    const existing = await this.installRepo.findByOrgAndPluginId(organizationId, data.pluginId);
    if (existing) {
      throw new ConflictError(`Plugin "${data.pluginId}" is already installed for this organization`);
    }

    await this.assertScopesAvailable(organizationId, registered.manifest.requiredScopes);

    const config = data.config || {};
    this.validator.validateConfig(registered.manifest, config);
    const secretKeys = this.validator.secretFieldKeys(registered.manifest);
    const encryptedConfig = encryptSecretFields(config, secretKeys);

    const missingRequired = registered.manifest.configSchema.some(
      (f) => f.required && (config[f.key] === undefined || config[f.key] === '')
    );
    const status = missingRequired ? 'pending_config' : 'active';

    const created = await this.installRepo.create(
      {
        organizationId,
        pluginId: data.pluginId,
        manifestVersion: registered.manifest.version,
        status,
        config: encryptedConfig,
        grantedScopes: registered.manifest.requiredScopes,
        installedBy: userId,
      },
      organizationId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new PluginInstalledEvent(created, { tenantId: organizationId, userId }));

    await auditLog.log({
      action: 'PLUGIN_INSTALLED',
      userId,
      tenantId: organizationId,
      entityType: 'plugin_installation',
      entityId: created._id,
      metadata: { pluginId: data.pluginId, status },
    });

    return created;
  }

  async update(
    id: string,
    data: PluginInstallUpdateDTO,
    organizationId: string,
    userId: string
  ): Promise<PluginInstallation> {
    const existing = await this.installRepo.findById(id, organizationId);
    if (!existing) throw new NotFoundError('Plugin installation not found');

    const registered = await this.getManifest(existing.pluginId);

    const updates: Partial<Omit<PluginInstallation, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>> = {};

    if (data.config) {
      const merged = { ...existing.config, ...data.config };
      this.validator.validateConfig(registered.manifest, merged);
      const secretKeys = this.validator.secretFieldKeys(registered.manifest);
      updates.config = encryptSecretFields(merged, secretKeys);
    }
    if (data.status) {
      updates.status = data.status;
    }

    const updated = await this.installRepo.update(id, updates, organizationId, userId);
    if (!updated) throw new NotFoundError('Plugin installation not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new PluginUpdatedEvent(updated, data, { tenantId: organizationId, userId }));

    await auditLog.logUpdate(userId, organizationId, 'plugin_installation', id, existing, updated);

    return updated;
  }

  async enable(id: string, organizationId: string, userId: string): Promise<PluginInstallation> {
    const existing = await this.installRepo.findById(id, organizationId);
    if (!existing) throw new NotFoundError('Plugin installation not found');

    const registered = await this.getManifest(existing.pluginId);
    const missingRequired = registered.manifest.configSchema.some((f) => {
      if (!f.required) return false;
      const value = existing.config[f.key];
      return value === undefined || value === null || value === '';
    });
    if (missingRequired) {
      throw new ValidationError('Cannot enable plugin: required configuration fields are missing');
    }

    const updated = await this.installRepo.updateStatus(id, organizationId, 'active');
    if (!updated) throw new NotFoundError('Plugin installation not found');

    const pluginId = existing.pluginId;

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new (class extends DomainEvent {
        constructor() {
          super(PLUGIN_ENABLED, { entityId: id, entityType: 'plugin_installation', pluginId }, {
            tenantId: organizationId,
            userId,
          });
        }
      })()
    );

    return updated;
  }

  async disable(id: string, organizationId: string, userId: string): Promise<PluginInstallation> {
    const existing = await this.installRepo.findById(id, organizationId);
    if (!existing) throw new NotFoundError('Plugin installation not found');

    const updated = await this.installRepo.updateStatus(id, organizationId, 'disabled');
    if (!updated) throw new NotFoundError('Plugin installation not found');

    const pluginId = existing.pluginId;

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new (class extends DomainEvent {
        constructor() {
          super(PLUGIN_DISABLED, { entityId: id, entityType: 'plugin_installation', pluginId }, {
            tenantId: organizationId,
            userId,
          });
        }
      })()
    );

    return updated;
  }

  async uninstall(id: string, organizationId: string, userId: string): Promise<void> {
    const existing = await this.installRepo.findById(id, organizationId);
    if (!existing) throw new NotFoundError('Plugin installation not found');

    await this.installRepo.hardDelete(id, organizationId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new PluginUninstalledEvent(id, existing.pluginId, organizationId, { userId })
    );

    await auditLog.logDelete(userId, organizationId, 'plugin_installation', id, { pluginId: existing.pluginId });
  }

  async listInstalled(organizationId: string): Promise<PluginInstallation[]> {
    return this.installRepo.listForOrganization(organizationId);
  }

  async getInstallation(id: string, organizationId: string): Promise<PluginInstallation> {
    const installation = await this.installRepo.findById(id, organizationId);
    if (!installation) throw new NotFoundError('Plugin installation not found');
    return installation;
  }

  /**
   * Guards against a plugin declaring requiredScopes the organization's
   * current subscription tier doesn't unlock (e.g. apiAccess-gated
   * capabilities on the free plan) — reuses the same
   * OrganizationFeatures gate billing already enforces elsewhere rather
   * than introducing a parallel entitlement check.
   */
  private async assertScopesAvailable(organizationId: string, requiredScopes: string[]): Promise<void> {
    if (requiredScopes.length === 0) return;
    const organization = await organizationRepository.findById(organizationId, organizationId, false, true);
    if (!organization) throw new NotFoundError('Organization not found');

    if (requiredScopes.some((s) => s.startsWith('api_key:')) && !organization.features.apiAccess) {
      throw new AppError(
        'This plugin requires API access, which is not included in your current plan',
        'FEATURE_NOT_AVAILABLE',
        402
      );
    }
  }
}

export const pluginService = new PluginService();