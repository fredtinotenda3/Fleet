// server/cqrs/query.ts

/**
 * Marker interface for all queries in the system.
 *
 * A query represents a request to read state. Queries must never mutate
 * data and must never have side effects beyond optional caching.
 *
 * Naming convention: Get<Entity>[By<Criteria>]Query or
 * Search<Entity>Query, e.g. GetVehicleByIdQuery, SearchVehiclesQuery.
 */
export interface IQuery {
  readonly queryName: string;
}

export abstract class BaseQuery implements IQuery {
  public readonly queryName: string;

  constructor(queryName: string) {
    this.queryName = queryName;
  }
}

export interface IQueryHandler<TQuery extends IQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Constructor type used for registering handlers against a query class.
 *
 * Deliberately requires a static `queryName` string (set explicitly by
 * each concrete query, e.g. `static readonly queryName = 'GetTripsQuery'`)
 * rather than relying on the built-in `Function.name`. Production builds
 * minify class names, and Next.js may bundle the same query class into
 * more than one chunk (e.g. once via the central cqrs bootstrap module,
 * once via a route handler that imports it directly), each minified
 * independently. That made `SomeQuery.name` resolve to different mangled
 * strings (or collide on the same one, like "i") depending on which
 * bundle referenced it, so the QueryBus looked up a name that didn't
 * match what it registered under. A static string literal survives
 * minification untouched and is identical no matter which chunk reads
 * it, so registration and lookup always agree.
 */
export type QueryConstructor<T extends IQuery = IQuery> = (new (
  ...args: any[]
) => T) & { readonly queryName: string };