// server/events/base/IEventHandler.ts

import { IEvent } from './IEvent';

export interface IEventHandler<TEvent extends IEvent = IEvent> {
  handle(event: TEvent): Promise<void>;
}