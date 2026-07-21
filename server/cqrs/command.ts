// server/cqrs/command.ts

/**
 * Marker interface for all commands in the system.
 *
 * A command represents an intent to change state (create, update, delete,
 * or any other write operation). Commands carry only the data needed to
 * perform the operation — they contain no business logic themselves.
 *
 * Naming convention: <Verb><Entity>Command, e.g. CreateVehicleCommand.
 */
export interface ICommand {
  readonly commandName: string;
}

/**
 * Base class for commands. Concrete commands extend this and pass their
 * own class name as commandName so the CommandBus can route by identity
 * without relying on `instanceof` chains (which break across module
 * reloads in Next.js dev mode where the same class can be loaded twice
 * under different module instances).
 */
export abstract class BaseCommand implements ICommand {
  public readonly commandName: string;

  constructor(commandName: string) {
    this.commandName = commandName;
  }
}

/**
 * A command handler executes exactly one command type and returns a
 * result. TResult defaults to void for pure side-effecting commands, but
 * most of our commands return the affected entity so the caller doesn't
 * need a follow-up query.
 */
export interface ICommandHandler<TCommand extends ICommand, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}

/**
 * Constructor type used for registering handlers against a command class
 * (not an instance), so the bus can map `SomeCommand.name` -> handler at
 * registration time.
 */
/**
 * Constructor type used for registering handlers against a command class.
 *
 * Deliberately requires a static `commandName` string (set explicitly by
 * each concrete command, e.g. `static readonly commandName = 'CreateTripCommand'`)
 * rather than relying on the built-in `Function.name`. Production builds
 * minify class names, and Next.js may bundle the same command class into
 * more than one chunk (e.g. once via the central cqrs bootstrap module,
 * once via a route handler that imports it directly), each minified
 * independently. That made `SomeCommand.name` resolve to different
 * mangled strings (or collide on the same one, like "i") depending on
 * which bundle referenced it, so the CommandBus looked up a name that
 * didn't match what it registered under. A static string literal
 * survives minification untouched and is identical no matter which
 * chunk reads it, so registration and lookup always agree.
 */
export type CommandConstructor<T extends ICommand = ICommand> = (new (
  ...args: any[]
) => T) & { readonly commandName: string };