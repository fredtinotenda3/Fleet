export interface IEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}