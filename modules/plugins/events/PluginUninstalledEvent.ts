// modules/plugins/events/PluginUninstalledEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { PLUGIN_UNINSTALLED } from './event-names';

export class PluginUninstalledEvent extends DomainEvent {
  constructor(
    installationId: string,
    pluginId: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(PLUGIN_UNINSTALLED, {
      entityId: installationId,
      entityType: 'plugin_installation',
      pluginId,
      tenantId,
    }, metadata);
  }
}