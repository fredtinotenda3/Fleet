// modules/plugins/events/PluginInstalledEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { PLUGIN_INSTALLED } from './event-names';
import { PluginInstallation } from '../types/plugin.types';

export class PluginInstalledEvent extends DomainEvent {
  constructor(installation: PluginInstallation, metadata?: Record<string, unknown>) {
    super(PLUGIN_INSTALLED, {
      entityId: installation._id,
      entityType: 'plugin_installation',
      pluginId: installation.pluginId,
      tenantId: installation.organizationId,
    }, metadata);
  }
}