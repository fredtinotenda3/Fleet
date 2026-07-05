// modules/security/registry/PermissionRegistry.ts

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  description?: string;
  requiresResourceScope: boolean;
  isCustom: boolean;
}

/**
 * Central catalogue of every permission key usable across the platform,
 * both static (Permission enum members) and dynamic (custom keys
 * composed into CustomRole.customPermissionKeys or referenced by
 * ResourcePermission grants). Mirrors the role RuleActionRegistry plays
 * for the business rule engine: a single place other modules register
 * against instead of the Permission Engine needing to import every
 * domain module directly.
 *
 * Stored on globalThis so Next.js's dev-mode module reloads don't wipe
 * registrations mid-session, matching the pattern used by CommandBus,
 * QueryBus, and RuleActionRegistry elsewhere in the codebase.
 */
class PermissionRegistryImpl {
  private readonly definitions = new Map<string, PermissionDefinition>();

  register(definition: PermissionDefinition): void {
    this.definitions.set(definition.key, definition);
  }

  registerMany(definitions: PermissionDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  isRegistered(key: string): boolean {
    return this.definitions.has(key);
  }

  get(key: string): PermissionDefinition | undefined {
    return this.definitions.get(key);
  }

  getAll(): PermissionDefinition[] {
    return Array.from(this.definitions.values());
  }

  getByCategory(category: string): PermissionDefinition[] {
    return this.getAll().filter((definition) => definition.category === category);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _permissionRegistry: PermissionRegistryImpl | undefined;
}

export const permissionRegistry: PermissionRegistryImpl =
  global._permissionRegistry ?? (global._permissionRegistry = new PermissionRegistryImpl());