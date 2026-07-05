// server/events/outbox/OutboxEvent.ts

import { BaseEntity } from '@/shared/types/common.types';

export interface OutboxEvent extends BaseEntity {
  eventId: string;
  eventName: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  processed: boolean;
  processedAt?: Date;
  attempts: number;
  lastError?: string;
  scheduledAt?: Date;
}

