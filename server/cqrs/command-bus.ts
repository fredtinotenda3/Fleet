// server/cqrs/command-bus.ts

import { ICommand, ICommandHandler, CommandConstructor } from './command';

/**
 * In-process command bus. Routes a command instance to its registered
 * handler by command class name.
 *
 * This is intentionally a simple synchronous-dispatch in-memory bus, not
 * a distributed message bus — it exists to enforce the CQRS separation
 * (controllers/services depend on the bus, never directly on a handler
 * or a monolithic read/write service) while keeping the deployment model
 * identical to today's single-process Next.js API routes. A future phase
 * (Event-Driven Architecture, Phase 3) can layer an outbox/queue
 * publisher on top of this without changing any call site, since every
 * write already flows through here.
 */
export class CommandBus {
  private readonly handlers = new Map<string, ICommandHandler<any, any>>();

  /**
   * Registers a handler for a given command class. Re-registering the
   * same command class overwrites the previous handler rather than
   * throwing — this makes the bus safe to re-bootstrap on every module
   * load in Next.js dev mode (hot reload) without crashing the process.
   */
  register<TCommand extends ICommand, TResult = void>(
    commandType: CommandConstructor<TCommand>,
    handler: ICommandHandler<TCommand, TResult>
  ): void {
    this.handlers.set(commandType.commandName, handler);
  }

  /**
   * Returns true if a handler is currently registered for the given
   * command class. Useful for idempotent bootstrap guards.
   */
  isRegistered<TCommand extends ICommand>(
    commandType: CommandConstructor<TCommand>
  ): boolean {
    return this.handlers.has(commandType.commandName);
  }

  /**
   * Executes a command by dispatching it to its registered handler.
   * Throws if no handler is registered — this is a programming error
   * (a command was constructed but never wired up in a *.cqrs.register.ts
   * file) and should fail loudly rather than silently no-op.
   */
  async execute<TResult = void>(command: ICommand): Promise<TResult> {
    const handler = this.handlers.get(command.commandName);
    if (!handler) {
      throw new Error(
        `[CommandBus] No handler registered for command "${command.commandName}". ` +
          `Did you forget to call the module's register*CqrsHandlers() function?`
      );
    }
    return handler.execute(command) as Promise<TResult>;
  }
}

/**
 * Process-wide singleton. Stored on globalThis in development so that
 * Next.js's module-reload-on-change behavior doesn't wipe registrations
 * out from under in-flight requests, mirroring the existing pattern used
 * for the MongoDB client in infrastructure/database/mongodb.ts.
 */
declare global {
  // eslint-disable-next-line no-var
  var _commandBus: CommandBus | undefined;
}

export const commandBus: CommandBus =
  global._commandBus ?? (global._commandBus = new CommandBus());