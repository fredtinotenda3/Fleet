// modules/plugins/services/plugin-loader.service.ts

import { pluginRepository } from '../repositories/plugin.repository';
import { pluginInstallationRepository } from '../repositories/plugin-installation.repository';
import { pluginCapabilityRegistry } from '../registry/PluginCapabilityRegistry';
import { buildPluginContext } from '../sdk/plugin-sdk';
import { PluginInstallation } from '../types/plugin.types';
import { AppError, NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { PluginErrorEvent } from '../events/PluginErrorEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Resolves an active plugin installation, checks it against its manifest,
 * builds a scoped PluginContext (the SDK surface), and dispatches a
 * capability execution through PluginCapabilityRegistry. This is the
 * runtime counterpart to PluginManifestValidatorService's static checks â€”
 * loader failures (installation disabled, manifest capability missing)
 * are recorded onto the installation and emitted as PluginErrorEvent so
 * SecurityAuditHandler-style downstream consumers can alert on repeated
 * plugin failures, mirroring how WorkflowEngine.processTimeouts()
 * escalates stuck steps.
 */
export class PluginLoaderService {
  async executeCapability(
    organizationId: string,
    pluginId: string,
    capabilityKey: string,
    input: unknown,
    opts: { userId?: string; correlationId?: string } = {}
  ): Promise<unknown> {
    const installation = await pluginInstallationRepository.findByOrgAndPluginId(organizationId, pluginId);
    if (!installation) {
      throw new NotFoundError(`Plugin "${pluginId}" is not installed for this organization`);
    }
    if (installation.status !== 'active') {
      throw new AppError(
        `Plugin "${pluginId}" is not active (status: ${installation.status})`,
        'PLUGIN_NOT_ACTIVE',
        409
      );
    }

    const registered = await pluginRepository.findByPluginId(pluginId);
    if (!registered) {
      throw new NotFoundError(`Plugin "${pluginId}" is no longer registered in the catalogue`);
    }

    const capability = registered.manifest.capabilities.find((c) => c.key === capabilityKey);
    if (!capability) {
      throw new AppError(
        `Plugin "${pluginId}" does not declare capability "${capabilityKey}"`,
        'CAPABILITY_NOT_DECLARED',
        400
      );
    }

    if (!pluginCapabilityRegistry.isRegistered(capabilityKey)) {
      await this.recordFailure(installation, `Capability "${capabilityKey}" has no registered handler`);
      throw new AppError(
        `Capability "${capabilityKey}" is not currently available on this deployment`,
        'CAPABILITY_UNAVAILABLE',
        503
      );
    }

    const context = buildPluginContext({
      tenantId: organizationId,
      installation,
      userId: opts.userId,
      correlationId: opts.correlationId,
    });

    try {
      const result = await pluginCapabilityRegistry.execute(capabilityKey, input, context);
      await pluginInstallationRepository.updateStatus(installation._id!, organizationId, 'active', {
        lastActiveAt: new Date(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown plugin execution error';
      await this.recordFailure(installation, message);
      monitoring.logError(`[PluginLoader] Capability "${capabilityKey}" failed for plugin "${pluginId}"`, error as Error, {
        tenantId: organizationId,
      });
      throw error;
    }
  }

  private async recordFailure(installation: PluginInstallation, message: string): Promise<void> {
    await pluginInstallationRepository.updateStatus(installation._id!, installation.organizationId, 'error', {
      lastError: message,
    });

    const bus = EventBusFactory.getInstance();
    await bus.publish(
      new PluginErrorEvent(installation._id!, installation.pluginId, installation.organizationId, message)
    );
  }

  /**
   * Returns every active installation across the organization that
   * declared `eventName` in its manifest's subscribedEvents â€” used by
   * Slice 10b's PluginEventDispatchHandler to fan a domain/webhook event
   * out to interested plugins.
   */
  async resolveSubscribers(organizationId: string, eventName: string): Promise<
    Array<{ installation: PluginInstallation; manifest: import('../types/plugin.types').PluginManifest }>
  > {
    const installations = await pluginInstallationRepository.listActiveByOrgAndEvent(organizationId, eventName);
    const results: Array<{ installation: PluginInstallation; manifest: import('../types/plugin.types').PluginManifest }> = [];

    for (const installation of installations) {
      const registered = await pluginRepository.findByPluginId(installation.pluginId);
      if (registered?.manifest.subscribedEvents?.includes(eventName)) {
        results.push({ installation, manifest: registered.manifest });
      }
    }

    return results;
  }
}

export const pluginLoaderService = new PluginLoaderService();