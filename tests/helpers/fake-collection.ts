// tests/helpers/fake-collection.ts
//
// A deliberately small in-memory stand-in for a MongoDB collection,
// supporting exactly the operators BaseRepository uses. It exists so the
// tenant-isolation suite can run in CI (and in restricted build sandboxes)
// without downloading a mongod binary.
//
// It is NOT a Mongo emulator. It implements equality, $ne, $in, $nin and
// $exists — which is the whole surface the repository's generated filters
// touch. If a future repository change starts emitting an operator this
// does not understand, `matches()` throws loudly rather than silently
// returning the wrong rows, so an unsupported operator can never make an
// isolation test pass by accident.

export interface FakeDoc {
  _id: string;
  [key: string]: unknown;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return idCounter.toString(16).padStart(24, '0');
}

const SUPPORTED_OPERATORS = new Set(['$ne', '$in', '$nin', '$exists', '$gte', '$lte', '$gt', '$lt']);

/**
 * Comparable ordering for $gte/$lte/$gt/$lt.
 *
 * Dates are compared by epoch millis, not by identity or by string
 * form -- the finance repositories filter on periodStart/periodEnd, and
 * two Date objects for the same instant are never `===`. Anything
 * non-comparable (undefined, an object) returns null so the operator
 * evaluates to false rather than to an accidental truth via JS's
 * coercion rules.
 */
function comparable(value: unknown): number | string | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  return null;
}

function compareValues(value: unknown, operand: unknown): number | null {
  const left = comparable(value);
  const right = comparable(operand);
  if (left === null || right === null) return null;
  if (typeof left !== typeof right) return null;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function matchOperator(value: unknown, operator: string, operand: unknown): boolean {
  switch (operator) {
    case '$ne':
      return value !== operand;
    case '$in':
      return Array.isArray(operand) && operand.includes(value as never);
    case '$nin':
      return Array.isArray(operand) && !operand.includes(value as never);
    case '$exists':
      return (value !== undefined) === Boolean(operand);
    case '$gte': {
      const c = compareValues(value, operand);
      return c !== null && c >= 0;
    }
    case '$lte': {
      const c = compareValues(value, operand);
      return c !== null && c <= 0;
    }
    case '$gt': {
      const c = compareValues(value, operand);
      return c !== null && c > 0;
    }
    case '$lt': {
      const c = compareValues(value, operand);
      return c !== null && c < 0;
    }
    default:
      throw new Error(
        `fake-collection: unsupported operator "${operator}". Extend the fake ` +
          'rather than letting an isolation test pass without evaluating it.'
      );
  }
}

export function matches(doc: FakeDoc, filter: Record<string, unknown>): boolean {
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$or') {
      const clauses = condition as Array<Record<string, unknown>>;
      if (!clauses.some((c) => matches(doc, c))) return false;
      continue;
    }
    if (field === '$and') {
      const clauses = condition as Array<Record<string, unknown>>;
      if (!clauses.every((c) => matches(doc, c))) return false;
      continue;
    }

    const value = doc[field];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      Object.keys(condition as object).some((k) => k.startsWith('$'))
    ) {
      for (const [op, operand] of Object.entries(condition as Record<string, unknown>)) {
        if (!SUPPORTED_OPERATORS.has(op)) {
          throw new Error(`fake-collection: unsupported operator "${op}"`);
        }
        if (!matchOperator(value, op, operand)) return false;
      }
      continue;
    }

    if (value !== condition) return false;
  }
  return true;
}

/** Records every filter the repository builds, so tests can assert on the
 *  query itself and not only on its results. */
export class FakeCollection {
  public docs: FakeDoc[] = [];
  public seenFilters: Array<Record<string, unknown>> = [];

  seed(docs: Array<Record<string, unknown>>): void {
    this.docs = docs.map((d) => ({ _id: nextId(), ...d })) as FakeDoc[];
  }

  private select(filter: Record<string, unknown>): FakeDoc[] {
    this.seenFilters.push(filter);
    const normalized = { ...filter };
    if (normalized._id && typeof normalized._id === 'object') {
      normalized._id = String(normalized._id);
    }
    return this.docs.filter((d) => matches(d, normalized));
  }

  find(filter: Record<string, unknown> = {}) {
    let rows = this.select(filter);
    const api = {
      sort: () => api,
      skip: (n: number) => {
        rows = rows.slice(n);
        return api;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return api;
      },
      toArray: async () => rows,
    };
    return api;
  }

  async findOne(filter: Record<string, unknown>): Promise<FakeDoc | null> {
    return this.select(filter)[0] ?? null;
  }

  async countDocuments(filter: Record<string, unknown> = {}): Promise<number> {
    return this.select(filter).length;
  }

  async insertOne(doc: Record<string, unknown>) {
    const withId = { _id: nextId(), ...doc } as FakeDoc;
    this.docs.push(withId);
    return { insertedId: withId._id };
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown> }
  ): Promise<FakeDoc | null> {
    const target = this.select(filter)[0];
    if (!target) return null;
    Object.assign(target, update.$set ?? {});
    return target;
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown> }
  ) {
    const target = this.select(filter)[0];
    if (!target) return { modifiedCount: 0 };
    Object.assign(target, update.$set ?? {});
    return { modifiedCount: 1 };
  }

  async deleteOne(filter: Record<string, unknown>) {
    const target = this.select(filter)[0];
    if (!target) return { deletedCount: 0 };
    this.docs = this.docs.filter((d) => d !== target);
    return { deletedCount: 1 };
  }

  async deleteMany() {
    this.docs = [];
    return { deletedCount: 0 };
  }

  /**
   * Minimal bulkWrite supporting exactly the shape
   * AttentionItemRepository.upsertFeedItems() emits: updateOne with
   * $set / $setOnInsert and upsert:true. Not a general Mongo bulkWrite
   * emulation -- extend this (per the file header's own policy) if a
   * future caller needs a shape this doesn't cover, rather than letting
   * it silently no-op.
   */
  async bulkWrite(
    ops: Array<{
      updateOne: {
        filter: Record<string, unknown>;
        update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> };
        upsert?: boolean;
      };
    }>
  ): Promise<{ upsertedCount: number; modifiedCount: number; matchedCount: number }> {
    let upsertedCount = 0;
    let modifiedCount = 0;
    let matchedCount = 0;

    for (const op of ops) {
      if (!op.updateOne) {
        throw new Error('fake-collection: bulkWrite only supports updateOne operations');
      }
      const { filter, update, upsert } = op.updateOne;
      const target = this.select(filter)[0];

      if (target) {
        matchedCount += 1;
        Object.assign(target, update.$set ?? {});
        modifiedCount += 1;
      } else if (upsert) {
        const newDoc = {
          _id: nextId(),
          ...filter,
          ...(update.$set ?? {}),
          ...(update.$setOnInsert ?? {}),
        } as FakeDoc;
        this.docs.push(newDoc);
        upsertedCount += 1;
      }
    }

    return { upsertedCount, modifiedCount, matchedCount };
  }

  /**
   * Minimal aggregate supporting exactly the shape the finance
   * repositories emit: a `$match` stage followed by a `$group` stage
   * whose accumulators are `$sum` (either of a field path or of the
   * literal 1). Group `_id` may be a field path string or an object of
   * field paths, matching AllocationLedgerRepository.
   * getNetTotalsByCategory (composite _id) and getNetTotalsByGlAccount
   * (single field path).
   *
   * Added because the allocation ledger's netting behaviour -- a
   * reversing posting carrying the equal-and-opposite reportingAmount so
   * that summing nets it to zero -- IS the property the cost engine
   * depends on, and it lives in an aggregation. Without this, that
   * property could only be asserted by mocking the repository, which
   * would test the mock instead of the pipeline. Per this file's own
   * header policy, unsupported stages and accumulators throw loudly
   * rather than silently returning the wrong rows.
   */
  aggregate(pipeline: Array<Record<string, unknown>>) {
    const stages = pipeline ?? [];
    for (const stage of stages) {
      const names = Object.keys(stage);
      if (names.length !== 1 || !['$match', '$group'].includes(names[0])) {
        throw new Error(
          `fake-collection: unsupported aggregation stage "${names.join(',')}". ` +
            'Extend the fake rather than letting a test pass without evaluating it.'
        );
      }
    }

    const matchStage = stages.find((s) => '$match' in s)?.$match as
      | Record<string, unknown>
      | undefined;
    let rows: FakeDoc[] = matchStage ? this.select(matchStage) : this.docs.slice();

    const groupStage = stages.find((s) => '$group' in s)?.$group as
      | Record<string, unknown>
      | undefined;

    let output: Array<Record<string, unknown>> = rows as Array<Record<string, unknown>>;

    if (groupStage) {
      const { _id: idSpec, ...accumulators } = groupStage;

      const keyOf = (doc: FakeDoc): { key: string; id: unknown } => {
        if (typeof idSpec === 'string') {
          const id = doc[idSpec.replace(/^\$/, '')];
          return { key: JSON.stringify(id ?? null), id: id ?? null };
        }
        if (idSpec && typeof idSpec === 'object') {
          const id: Record<string, unknown> = {};
          for (const [field, pathSpec] of Object.entries(idSpec as Record<string, string>)) {
            id[field] = doc[String(pathSpec).replace(/^\$/, '')] ?? null;
          }
          return { key: JSON.stringify(id), id };
        }
        return { key: 'null', id: null };
      };

      const groups = new Map<string, { id: unknown; docs: FakeDoc[] }>();
      for (const doc of rows) {
        const { key, id } = keyOf(doc);
        const bucket = groups.get(key);
        if (bucket) bucket.docs.push(doc);
        else groups.set(key, { id, docs: [doc] });
      }

      output = Array.from(groups.values()).map(({ id, docs }) => {
        const result: Record<string, unknown> = { _id: id };
        for (const [outField, accumulator] of Object.entries(accumulators)) {
          const spec = accumulator as Record<string, unknown>;
          const accNames = Object.keys(spec);
          if (accNames.length !== 1 || accNames[0] !== '$sum') {
            throw new Error(
              `fake-collection: unsupported accumulator "${accNames.join(',')}" in $group. ` +
                'Only $sum is implemented.'
            );
          }
          const operand = spec.$sum;
          if (typeof operand === 'number') {
            result[outField] = docs.length * operand;
          } else if (typeof operand === 'string') {
            const field = operand.replace(/^\$/, '');
            result[outField] = docs.reduce((sum, d) => {
              const v = d[field];
              return sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
            }, 0);
          } else {
            throw new Error('fake-collection: $sum operand must be a field path or a number.');
          }
        }
        return result;
      });
    }

    return {
      toArray: async () => output,
    };
  }

  /** The tenant predicate actually applied by the most recent query. */
  lastFilter(): Record<string, unknown> {
    return this.seenFilters[this.seenFilters.length - 1] ?? {};
  }
}
