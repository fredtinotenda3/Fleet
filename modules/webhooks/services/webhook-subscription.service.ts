// modules/webhooks/services/webhook-subscription.service.ts

import {
  webhookSubscriptionRepository,
  WebhookSubscriptionRepository,
} from '../repositories/webhook-subscription.repository';
import { webhookSigningService, WebhookSigningService } from './webhook-signing.service';
import {
  WebhookSubscription,
  WebhookSubscriptionCreateDTO,
  WebhookSubscriptionUpdateDTO,
} from '../types/webhook.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { WebhookSubscriptionCreatedEvent } from '../events/WebhookSubscriptionCreatedEvent';
import { WebhookSubscriptionUpdatedEvent } from '../events/WebhookSubscriptionUpdatedEvent';
import { WebhookSubscriptionDeletedEvent } from '../events/WebhookSubscriptionDeletedEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

/**
 * Every event name a subscription declares must exist in this set.
 * Sourced statically here (rather than importing the full
 * server/events/event-names.ts barrel, which would create a dependency
 * from a "leaf" domain module back onto server-level wiring) — kept in
 * sync manually, same tradeoff PluginManifestValidatorService accepts
 * for permission-key validation via PermissionRegistry, except this list
 * is small and stable enough that a static array is simpler than a
 * runtime registry for now.
 */
const KNOWN_EVENT_NAMES = new Set([
  'VehicleCreated', 'VehicleUpdated', 'VehicleDeleted', 'VehicleStatusChanged',
  'ExpenseCreated', 'ExpenseUpdated', 'ExpenseDeleted',
  'FuelLogged', 'FuelLogUpdated', 'FuelLogDeleted',
  'ReminderCreated', 'ReminderUpdated', 'ReminderDeleted', 'ReminderCompleted', 'ReminderOverdue',
  'TripCreated', 'TripUpdated', 'TripDeleted', 'TripCompleted',
  'RuleCreated', 'RuleUpdated', 'RuleDeleted',
  'InvoiceCreated', 'InvoicePaid', 'SubscriptionUpgraded',
  'OrganizationCreated', 'MemberJoined', 'MemberRemoved',
  'TelematicsDataIngested', 'GeofenceAlert',
]);

export class WebhookSubscriptionService {
  constructor(
    private readonly repo: WebhookSubscriptionRepository = webhookSubscriptionRepository,
    private readonly signing: WebhookSigningService = webhookSigningService
  ) {}

  async create(
    data: WebhookSubscriptionCreateDTO,
    tenantId: string,
    userId: string
  ): Promise<WebhookSubscription> {
    this.validateEvents(data.events);
    this.validateUrl(data.url);

    const created = await this.repo.create(
      {
        tenantId,
        organizationId: tenantId,
        name: data.name.trim(),
        url: data.url,
        secret: this.signing.generateSecret(),
        events: data.events,
        status: 'active',
        description: data.description,
        consecutiveFailures: 0,
      },
      tenantId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new WebhookSubscriptionCreatedEvent(created, { tenantId, userId }));

    await auditLog.log({
      action: 'WEBHOOK_SUBSCRIPTION_CREATED',
      userId,
      tenantId,
      entityType: 'webhook_subscription',
      entityId: created._id,
      metadata: { name: created.name, url: created.url, events: created.events },
    });

    return created;
  }

  async update(
    id: string,
    data: WebhookSubscriptionUpdateDTO,
    tenantId: string,
    userId: string
  ): Promise<WebhookSubscription> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Webhook subscription not found');
    }

    if (data.events) this.validateEvents(data.events);
    if (data.url) this.validateUrl(data.url);

    const updates: Partial<Omit<WebhookSubscription, '_id' | 'organizationId' | 'createdAt' | 'createdBy'>> = {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.events !== undefined && { events: data.events }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
    };

    // Re-enabling after being auto-disabled for excessive failures
    // should reset the failure counter, otherwise the very next
    // transient hiccup would immediately re-trip the auto-disable guard.
    if (data.status === 'active' && existing.status === 'disabled') {
      updates.consecutiveFailures = 0;
    }

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) {
      throw new NotFoundError('Webhook subscription not found');
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new WebhookSubscriptionUpdatedEvent(updated, data, { tenantId, userId }));

    await auditLog.logUpdate(userId, tenantId, 'webhook_subscription', id, existing, updated);

    return updated;
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Webhook subscription not found');
    }

    await this.repo.softDelete(id, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new WebhookSubscriptionDeletedEvent(id, existing.name, tenantId, { userId })
    );

    await auditLog.logDelete(userId, tenantId, 'webhook_subscription', id, { name: existing.name });
  }

  async get(id: string, tenantId: string): Promise<WebhookSubscription> {
    const subscription = await this.repo.findById(id, tenantId);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription not found');
    }
    return subscription;
  }

  async list(tenantId: string): Promise<WebhookSubscription[]> {
    return this.repo.findByOrganization(tenantId);
  }

  /**
   * Rotates a subscription's signing secret. The old secret is
   * immediately invalid for verifying future deliveries — callers should
   * update their receiver's expected secret before (or immediately
   * after) calling this, since there is no grace-period dual-secret
   * support in this initial implementation.
   */
  async rotateSecret(id: string, tenantId: string, userId: string): Promise<WebhookSubscription> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Webhook subscription not found');
    }

    const newSecret = this.signing.generateSecret();
    const updated = await this.repo.update(id, { secret: newSecret } as Partial<WebhookSubscription>, tenantId, userId);
    if (!updated) {
      throw new NotFoundError('Webhook subscription not found');
    }

    await auditLog.log({
      action: 'WEBHOOK_SECRET_ROTATED',
      userId,
      tenantId,
      entityType: 'webhook_subscription',
      entityId: id,
      metadata: { name: existing.name },
    });

    return updated;
  }

  private validateEvents(events: string[]): void {
    if (events.length === 0) {
      throw new ValidationError('At least one event must be selected');
    }
    const unknown = events.filter((e) => !KNOWN_EVENT_NAMES.has(e));
    if (unknown.length > 0) {
      throw new ValidationError(`Unknown event name(s): ${unknown.join(', ')}`);
    }
  }

  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError('Webhook URL must be a valid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError('Webhook URL must use http or https');
    }
  }
}

export const webhookSubscriptionService = new WebhookSubscriptionService();