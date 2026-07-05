// modules/plugins/sdk/plugin-sdk.ts

import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { encryptionService } from '@/infrastructure/secrets/encryption.service';
import { PluginInstallation } from '../types/plugin.types';

/**
 * The runtime context passed into every PluginCapabilityHandler.execute()
 * call. This is the platform's "Integration SDK": a narrow, scoped surface
 * a plugin capability is allowed to touch, rather than handing it direct
 * access to repositories or the raw database. Mirrors how
 * RuleEvaluationContext / AbacEvaluationContext scope what business rules
 * and permission grants can see.
 */
export interface PluginContext {
  tenantId: string;
  installation: PluginInstallation;
  userId?: string;
  correlationId?: string;

  /** Decrypted config value lookup â€” secret-typed fields are decrypted lazily here, never held in plaintext on the installation record itself. */
  getConfig<T = unknown>(key: string): T | undefined;

  /** Publishes a domain event on behalf of the plugin, tagged with its pluginId in metadata for audit traceability. */
  publishEvent(eventName: string, payload: Record<string, unknown>): Promise<void>;

  /** Structured logging scoped to this plugin/tenant. */
  log(message: string, meta?: Record<string, unknown>): void;
  logError(message: string, error?: Error, meta?: Record<string, unknown>): void;

  /** Outbound HTTP for the plugin to call its external provider. Timeouts/redirect policy centralized here rather than left to each handler. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

const SECRET_PREFIX = 'v1:'; // matches EncryptionService's ciphertext format tag

export function buildPluginContext(params: {
  tenantId: string;
  installation: PluginInstallation;
  userId?: string;
  correlationId?: string;
}): PluginContext {
  const { tenantId, installation, userId, correlationId } = params;

  return {
    tenantId,
    installation,
    userId,
    correlationId,

    getConfig<T = unknown>(key: string): T | undefined {
      const raw = installation.config?.[key];
      if (typeof raw === 'string' && encryptionService.isEncrypted(raw)) {
        return encryptionService.decrypt(raw) as unknown as T;
      }
      return raw as T | undefined;
    },

    async publishEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
      const bus = EventBusFactory.getInstance();
      await bus.publish(
        new (class extends DomainEvent {
          constructor() {
            super(eventName, payload, {
              tenantId,
              userId,
              correlationId,
              source: `plugin:${installation.pluginId}`,
            });
          }
        })()
      );
    },

    log(message: string, meta?: Record<string, unknown>): void {
      monitoring.logInfo(`[Plugin:${installation.pluginId}] ${message}`, { tenantId, ...meta });
    },

    logError(message: string, error?: Error, meta?: Record<string, unknown>): void {
      monitoring.logError(`[Plugin:${installation.pluginId}] ${message}`, error, { tenantId, ...meta });
    },

    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** Encrypts every config field the manifest marks as `type: 'secret'` before persisting. */
export function encryptSecretFields(
  config: Record<string, unknown>,
  secretKeys: string[]
): Record<string, unknown> {
  const result = { ...config };
  for (const key of secretKeys) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0 && !value.startsWith(SECRET_PREFIX)) {
      result[key] = encryptionService.encrypt(value);
    }
  }
  return result;
}