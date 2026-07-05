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

export type QueryConstructor<T extends IQuery = IQuery> = new (
  ...args: any[]
) => T;