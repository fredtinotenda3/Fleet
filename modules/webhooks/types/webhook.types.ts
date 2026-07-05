// modules/webhooks/types/webhook.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type WebhookSubscriptionStatus = 'active' | 'disabled';

/**
 * A tenant-owned subscription to one or more domain event names (see
 * server/events/event-names.ts for the catalogue). `secret` is used to
 * HMAC-sign every delivery so the receiver can verify authenticity —
 * stored in plaintext deliberately (unlike SsoConnection.clientSecretEncrypted)
 * since the platform itself must read it back on every dispatch to sign
 * the payload; it is never returned to API responses after creation.
 */
export interface WebhookSubscription extends BaseEntity {
  organizationId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  status: WebhookSubscriptionStatus;
  description?: string;
  lastTriggeredAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  consecutiveFailures: number;
}

export interface WebhookSubscriptionCreateDTO {
  name: string;
  url: string;
  events: string[];
  description?: string;
}

export interface WebhookSubscriptionUpdateDTO {
  name?: string;
  url?: string;
  events?: string[];
  description?: string;
  status?: WebhookSubscriptionStatus;
}

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

/**
 * One row per delivery attempt (not per subscription-event) — a single
 * domain event dispatched to 3 subscribers produces 3 WebhookDeliveryLog
 * rows, each independently retryable via the underlying BullMQ job.
 */
export interface WebhookDeliveryLog extends BaseEntity {
  organizationId: string;
  subscriptionId: string;
  eventName: string;
  deliveryId: string;
  url: string;
  requestBody: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  responseStatusCode?: number;
  responseBody?: string;
  latencyMs?: number;
  attempt: number;
  error?: string;
  deliveredAt?: Date;
}

export interface WebhookDeliveryPayload {
  deliveryId: string;
  subscriptionId: string;
  url: string;
  secret: string;
  eventName: string;
  eventId: string;
  occurredOn: Date;
  payload: Record<string, unknown>;
  organizationId: string;
}