// modules/plugins/events/PluginErrorEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';

export interface PluginErrorPayload {
  installationId: string;
  pluginId: string;
  organizationId: string;
  error: string;
  [key: string]: unknown; // Index signature to satisfy Record<string, unknown>
}

export class PluginErrorEvent extends DomainEvent<PluginErrorPayload> {
  constructor(
    installationId: string,
    pluginId: string,
    organizationId: string,
    error: string
  ) {
    super('plugin.error', {
      installationId,
      pluginId,
      organizationId,
      error,
    });
  }
}