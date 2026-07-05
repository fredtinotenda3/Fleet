// modules/security/services/abac-evaluator.service.ts

import {
  AbacCondition,
  AbacEvaluationContext,
  AbacEvaluationResult,
  AbacEvaluationTrace,
} from '../types/abac.types';

function resolveAttribute(context: AbacEvaluationContext, path: string): unknown {
  const [root, ...rest] = path.split('.');
  let base: unknown;

  if (root === 'user') base = context.user;
  else if (root === 'resource') base = context.resource;
  else if (root === 'env' || root === 'environment') base = context.environment;
  else return undefined;

  return rest.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, base);
}

function evaluateSingle(actual: unknown, condition: AbacCondition): boolean {
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never);
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return false;
    case 'not_contains':
      if (typeof actual === 'string' && typeof expected === 'string') return !actual.includes(expected);
      if (Array.isArray(actual)) return !actual.includes(expected as never);
      return true;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    default:
      return false;
  }
}

/**
 * Evaluates a set of attribute-based conditions (AND semantics: every
 * condition must pass) attached to a ResourcePermission grant. Kept
 * self-contained within the security module rather than sharing code
 * with modules/rules's condition evaluator, per the "no cross-domain
 * coupling" architecture goal â€” the two evaluators solve similar but
 * distinctly-scoped problems (business rules vs. access control).
 */
export class AbacEvaluatorService {
  evaluate(
    conditions: AbacCondition[] | undefined,
    context: AbacEvaluationContext
  ): AbacEvaluationResult {
    if (!conditions || conditions.length === 0) {
      return { matched: true, trace: [] };
    }

    const trace: AbacEvaluationTrace[] = [];
    let matched = true;

    for (const condition of conditions) {
      const actual = resolveAttribute(context, condition.attribute);
      const result = evaluateSingle(actual, condition);
      trace.push({ condition, actual, result });
      if (!result) matched = false;
    }

    return { matched, trace };
  }
}

export const abacEvaluatorService = new AbacEvaluatorService();