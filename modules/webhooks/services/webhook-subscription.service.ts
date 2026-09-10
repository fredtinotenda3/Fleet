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
 *
 * ---------------------------------------------------------------------
 * IT IS NOT "WHICH EVENTS EXIST" -- IT IS "WHICH EVENTS DELIVER"
 * ---------------------------------------------------------------------
 * The previous list had 30 entries and accepted 12 that could never
 * fire, in two different ways:
 *
 *   NEVER PUBLISHED (8): TripCompleted, ReminderOverdue, InvoiceCreated,
 *     OrganizationCreated, MemberRemoved, SubscriptionUpgraded,
 *     TelematicsDataIngested, GeofenceAlert. Declared in
 *     event-names.ts; no code emits them.
 *
 *   PUBLISHED BUT NOT ROUTED HERE (4): VehicleStatusChanged, and
 *     RuleCreated/Updated/Deleted. Real events, but
 *     WebhookDispatchHandler is subscribed only to the names in
 *     bootstrap's `allEventNames`, and none of these four is in it.
 *
 * The effect on a customer is identical either way and is the worst
 * available: the subscription VALIDATES, saves, and shows `status:
 * active` in the UI, and no delivery ever arrives. An integration that
 * fails loudly can be fixed; one that silently never fires is debugged
 * against the wrong system, usually theirs.
 *
 * So this list now means "names that are published AND routed to
 * WebhookDispatchHandler". Four of the removed twelve are one line of
 * bootstrap wiring away from being real; adding them back means adding
 * that line first. tests/security/event-wiring-conformance.spec.ts is
 * the check that would have caught the drift.
 *
 * Still declared statically rather than imported, for the original
 * reason: a leaf domain module should not depend on server-level
 * wiring.
 */
const KNOWN_EVENT_NAMES = new Set([
  'VehicleCreated', 'VehicleUpdated', 'VehicleDeleted',
  'ExpenseCreated', 'ExpenseUpdated', 'ExpenseDeleted',
  'FuelLogged', 'FuelLogUpdated', 'FuelLogDeleted',
  'ReminderCreated', 'ReminderUpdated', 'ReminderDeleted', 'ReminderCompleted',
  'TripCreated', 'TripUpdated', 'TripDeleted',
  'InvoicePaid',
  'MemberJoined',
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