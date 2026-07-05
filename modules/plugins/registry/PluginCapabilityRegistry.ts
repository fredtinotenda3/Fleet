// modules/plugins/registry/PluginCapabilityRegistry.ts

import { PluginCapabilityType } from '../types/plugin.types';
import { PluginContext } from '../sdk/plugin-sdk';

export interface IPluginCapabilityHandler {
  /**
   * `input` is capability-specific and unvalidated at this layer â€” each
   * handler is responsible for validating its own payload shape, the same
   * division of responsibility RuleActionRegistry uses for rule actions.
   */
  execute(input: unknown, context: PluginContext): Promise<unknown>;
}

export interface PluginCapabilityDefinition {
  key: string;
  type: PluginCapabilityType;
  label: string;
  description?: string;
  handler: IPluginCapabilityHandler;
}

/**
 * Central catalogue mapping a capability `key` (as declared in a plugin's
 * manifest) to the code that actually runs it. Mirrors
 * modules/rules/registry/RuleActionRegistry.ts and
 * modules/security/registry/PermissionRegistry.ts: other modules register
 * their own capability handlers at bootstrap time rather than this module
 * importing every integration directly, keeping plugin providers
 * decoupled from the platform's domain modules.
 *
 * Stored on globalThis so Next.js dev-mode module reloads don't wipe
 * registrations mid-session (same rationale as the other registries).
 */
class PluginCapabilityRegistryImpl {
  private readonly capabilities = new Map<string, PluginCapabilityDefinition>();

  register(definition: PluginCapabilityDefinition): void {
    this.capabilities.set(definition.key, definition);
  }

  registerMany(definitions: PluginCapabilityDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  isRegistered(key: string): boolean {
    return this.capabilities.has(key);
  }

  get(key: string): PluginCapabilityDefinition | undefined {
    return this.capabilities.get(key);
  }

  getAll(): PluginCapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  async execute(key: string, input: unknown, context: PluginContext): Promise<unknown> {
    const definition = this.capabilities.get(key);
    if (!definition) {
      throw new Error(
        `[PluginCapabilityRegistry] No handler registered for capability "${key}". ` +
          `Did the plugin provider forget to register it at bootstrap?`
      );
    }
    return definition.handler.execute(input, context);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _pluginCapabilityRegistry: PluginCapabilityRegistryImpl | undefined;
}

export const pluginCapabilityRegistry: PluginCapabilityRegistryImpl =
  global._pluginCapabilityRegistry ?? (global._pluginCapabilityRegistry = new PluginCapabilityRegistryImpl());