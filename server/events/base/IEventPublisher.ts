// server/events/base/IEventPublisher.ts

import { DomainEvent } from './DomainEvent';

export interface IEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}