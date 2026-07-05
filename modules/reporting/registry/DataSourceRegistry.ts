// modules/reporting/registry/DataSourceRegistry.ts

import { DataSourceDefinition, DataSourceKey } from '../types/data-source.types';

/**
 * Stored on globalThis so Next.js's dev-mode module reloads don't wipe
 * registrations mid-session, mirroring PermissionRegistry / CommandBus /
 * QueryBus elsewhere in the codebase.
 */
class DataSourceRegistryImpl {
  private readonly sources = new Map<DataSourceKey, DataSourceDefinition>();

  register(definition: DataSourceDefinition): void {
    this.sources.set(definition.key, definition);
  }

  get(key: DataSourceKey): DataSourceDefinition | undefined {
    return this.sources.get(key);
  }

  getOrThrow(key: DataSourceKey): DataSourceDefinition {
    const source = this.sources.get(key);
    if (!source) {
      throw new Error(`[DataSourceRegistry] No data source registered for "${key}"`);
    }
    return source;
  }

  list(): DataSourceDefinition[] {
    return Array.from(this.sources.values());
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _dataSourceRegistry: DataSourceRegistryImpl | undefined;
}

export const dataSourceRegistry: DataSourceRegistryImpl =
  global._dataSourceRegistry ?? (global._dataSourceRegistry = new DataSourceRegistryImpl());