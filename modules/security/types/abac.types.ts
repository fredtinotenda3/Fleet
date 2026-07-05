// modules/security/types/abac.types.ts

export type AbacOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists';

/**
 * A single attribute condition, e.g. { attribute: "resource.department",
 * operator: "eq", value: "logistics" }. `attribute` is a dotted path
 * resolved against an AbacEvaluationContext's `user`, `resource`, or
 * `environment` root.
 */
export interface AbacCondition {
  attribute: string;
  operator: AbacOperator;
  value?: unknown;
}

export interface AbacEvaluationContext {
  user: Record<string, unknown>;
  resource: Record<string, unknown>;
  environment: Record<string, unknown>;
}

export interface AbacEvaluationTrace {
  condition: AbacCondition;
  actual: unknown;
  result: boolean;
}

export interface AbacEvaluationResult {
  matched: boolean;
  trace: AbacEvaluationTrace[];
}