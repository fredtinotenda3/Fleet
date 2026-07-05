// server/cqrs/query-bus.ts

import { IQuery, IQueryHandler, QueryConstructor } from './query';

/**
 * In-process query bus. Mirrors CommandBus but for reads. Kept as a
 * separate class (rather than a generic Bus<T>) so command and query
 * registration are visually and structurally distinct in every module's
 * cqrs.register.ts file — that distinction is the entire point of CQRS,
 * and collapsing the two bus types into one generic would blur it.
 */
export class QueryBus {
  private readonly handlers = new Map<string, IQueryHandler<any, any>>();

  register<TQuery extends IQuery, TResult>(
    queryType: QueryConstructor<TQuery>,
    handler: IQueryHandler<TQuery, TResult>
  ): void {
    this.handlers.set(queryType.name, handler);
  }

  isRegistered<TQuery extends IQuery>(
    queryType: QueryConstructor<TQuery>
  ): boolean {
    return this.handlers.has(queryType.name);
  }

  async execute<TResult>(query: IQuery): Promise<TResult> {
    const handler = this.handlers.get(query.queryName);
    if (!handler) {
      throw new Error(
        `[QueryBus] No handler registered for query "${query.queryName}". ` +
          `Did you forget to call the module's register*CqrsHandlers() function?`
      );
    }
    return handler.execute(query) as Promise<TResult>;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _queryBus: QueryBus | undefined;
}

export const queryBus: QueryBus =
  global._queryBus ?? (global._queryBus = new QueryBus());