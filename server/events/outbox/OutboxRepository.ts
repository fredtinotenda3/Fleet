// server/events/outbox/OutboxRepository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { OutboxEvent } from './OutboxEvent';
import { Filter } from 'mongodb';

export class OutboxRepository extends BaseRepository<OutboxEvent> {
  protected collectionName = 'tbloutbox_events';

  async getUnprocessedEvents(
    tenantId: string,
    limit: number = 100,
  ): Promise<OutboxEvent[]> {
    return this.findMany(
      {
        processed: false,
        $or: [
          { scheduledAt: { $exists: false } },
          { scheduledAt: { $lte: new Date() } },
        ],
      } as Filter<OutboxEvent>,
      tenantId,
      { limit, sortBy: 'createdAt', sortOrder: 'asc' },
    );
  }

  async markAsProcessed(id: string, tenantId: string): Promise<void> {
    await this.update(id, { processed: true, processedAt: new Date() }, tenantId);
  }

  async incrementAttempts(id: string, tenantId: string, error?: string): Promise<void> {
    const event = await this.findById(id, tenantId);
    if (!event) return;
    await this.update(id, {
      attempts: (event.attempts || 0) + 1,
      lastError: error,
    }, tenantId);
  }
}