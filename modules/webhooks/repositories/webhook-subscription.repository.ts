// modules/webhooks/repositories/webhook-subscription.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { WebhookSubscription } from '../types/webhook.types';

export class WebhookSubscriptionRepository extends BaseRepository<WebhookSubscription> {
  protected collectionName = 'tblwebhooksubscriptions';

  async findByOrganization(organizationId: string): Promise<WebhookSubscription[]> {
    return this.findMany({} as Filter<WebhookSubscription>, organizationId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  /**
   * The hot-path read: called once per matching domain event by
   * WebhookDispatchHandler to resolve every active subscriber for a
   * tenant whose `events` array contains the fired event name. Kept as
   * its own method (rather than reusing findByOrganization + filtering
   * in-memory) so the `events` containment check happens at the query
   * level via a covered index.
   */
  async findActiveSubscribers(organizationId: string, eventName: string): Promise<WebhookSubscription[]> {
    return this.findMany(
      { status: 'active', events: eventName } as Filter<WebhookSubscription>,
      organizationId
    );
  }

  async recordDeliveryOutcome(
    id: string,
    tenantId: string,
    success: boolean
  ): Promise<void> {
    const now = new Date();
    if (success) {
      await this.update(
        id,
        { lastTriggeredAt: now, lastSuccessAt: now, consecutiveFailures: 0 } as Partial<WebhookSubscription>,
        tenantId
      );
    } else {
      const existing = await this.findById(id, tenantId);
      const nextFailures = (existing?.consecutiveFailures ?? 0) + 1;
      await this.update(
        id,
        { lastTriggeredAt: now, lastFailureAt: now, consecutiveFailures: nextFailures } as Partial<WebhookSubscription>,
        tenantId
      );
    }
  }

  /**
   * Auto-disables a subscription once it has failed enough consecutive
   * times in a row that continuing to attempt delivery is pointless
   * (dead endpoint). Called from the webhook worker after recording a
   * failure; threshold is intentionally generous (20) since transient
   * receiver-side outages shouldn't silently kill a subscription.
   */
  async autoDisableIfExcessiveFailures(id: string, tenantId: string, threshold: number = 20): Promise<boolean> {
    const existing = await this.findById(id, tenantId);
    if (!existing || existing.status !== 'active') return false;
    if (existing.consecutiveFailures < threshold) return false;

    await this.update(id, { status: 'disabled' } as Partial<WebhookSubscription>, tenantId);
    return true;
  }
}

export const webhookSubscriptionRepository = new WebhookSubscriptionRepository();