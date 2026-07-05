// server/events/base/EventMetadata.ts

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
  tenantId?: string;
  userId?: string;
  source?: string;
  [key: string]: unknown;
};