import { commandBus } from './command-bus';
import { queryBus } from './query-bus';
import { registerVehicleCqrsHandlers } from '@/modules/vehicles/cqrs.register';
import { registerFuelCqrsHandlers } from '@/modules/fuel/cqrs.register';
import { registerExpenseCqrsHandlers } from '@/modules/expenses/cqrs.register';
import { registerMaintenanceCqrsHandlers } from '@/modules/maintenance/cqrs.register';
import { registerTripCqrsHandlers } from '@/modules/trips/cqrs.register';
import { bootstrapEvents } from '@/server/events/bootstrap';

declare global {
  // eslint-disable-next-line no-var
  var _cqrsBootstrapped: boolean | undefined;
}

export function bootstrapCqrs(): void {
  if (global._cqrsBootstrapped) {
    return;
  }

  registerVehicleCqrsHandlers(commandBus, queryBus);
  registerFuelCqrsHandlers(commandBus, queryBus);
  registerExpenseCqrsHandlers(commandBus, queryBus);
  registerMaintenanceCqrsHandlers(commandBus, queryBus);
  registerTripCqrsHandlers(commandBus, queryBus);

  bootstrapEvents();

  global._cqrsBootstrapped = true;
}

export { commandBus } from './command-bus';
export { queryBus } from './query-bus';