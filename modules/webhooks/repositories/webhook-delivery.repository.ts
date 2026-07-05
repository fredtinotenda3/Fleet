// modules/webhooks/repositories/webhook-delivery.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { WebhookDeliveryLog } from '../types/webhook.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class WebhookDeliveryRepository extends BaseRepository<WebhookDeliveryLog> {
  protected collectionName = 'tblwebhookdeliveries';

  async findBySubscription(
    subscriptionId: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<WebhookDeliveryLog>> {
    return this.findWithPagination(
      { subscriptionId } as Filter<WebhookDeliveryLog>,
      pagination,
      tenantId
    );
  }

  async findByDeliveryId(deliveryId: string, tenantId: string): Promise<WebhookDeliveryLog | null> {
    return this.findOne({ deliveryId } as Filter<WebhookDeliveryLog>, tenantId);
  }

  async markOutcome(
    id: string,
    tenantId: string,
    outcome: Pick<
      WebhookDeliveryLog,
      'status' | 'responseStatusCode' | 'responseBody' | 'latencyMs' | 'error'
    >
  ): Promise<void> {
    await this.update(
      id,
      { ...outcome, deliveredAt: new Date() } as Partial<WebhookDeliveryLog>,
      tenantId
    );
  }

  async deleteOldDeliveries(tenantId: string, olderThanDays: number = 30): Promise<number> {
    const collection = await this.getCollection();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await collection.deleteMany({
      ...this.getActiveFilter(tenantId),
      createdAt: { $lt: cutoff },
    } as Filter<WebhookDeliveryLog>);

    return result.deletedCount || 0;
  }
}

export const webhookDeliveryRepository = new WebhookDeliveryRepository();