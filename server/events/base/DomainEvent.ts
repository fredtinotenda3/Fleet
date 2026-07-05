// server/events/base/DomainEvent.ts
import { IEvent } from './IEvent';
import { randomUUID } from 'crypto';

export abstract class DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> implements IEvent {
  public readonly eventId: string;
  public readonly eventName: string;
  public readonly occurredOn: Date;
  public readonly payload: TPayload;
  public readonly metadata?: Record<string, unknown>;

  protected constructor(
    eventName: string,
    payload: TPayload,
    metadata?: Record<string, unknown>,
  ) {
    this.eventId = randomUUID();
    this.eventName = eventName;
    this.occurredOn = new Date();
    this.payload = payload;
    this.metadata = metadata;
  }
}