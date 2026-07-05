// server/events/bus/IEventBus.ts

import { IEventPublisher } from '../base/IEventPublisher';
import { IEventHandler } from '../base/IEventHandler';
import { IEvent } from '../base/IEvent';

export interface IEventBus extends IEventPublisher {
  subscribe<TEvent extends IEvent>(
    eventName: string,
    handler: IEventHandler<TEvent>,
  ): void;

  unsubscribe<TEvent extends IEvent>(
    eventName: string,
    handler: IEventHandler<TEvent>,
  ): void;

  use(middleware: (event: IEvent, next: () => Promise<void>) => Promise<void>): void;
}