// modules/plugins/events/PluginUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { PLUGIN_UPDATED } from './event-names';
import { PluginInstallation, PluginInstallUpdateDTO } from '../types/plugin.types';

export class PluginUpdatedEvent extends DomainEvent {
  constructor(
    installation: PluginInstallation,
    changes: PluginInstallUpdateDTO,
    metadata?: Record<string, unknown>
  ) {
    super(PLUGIN_UPDATED, {
      entityId: installation._id,
      entityType: 'plugin_installation',
      pluginId: installation.pluginId,
      status: installation.status,
      changes,
      tenantId: installation.organizationId,
    }, metadata);
  }
}