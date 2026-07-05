// modules/rules/types/rule.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type RuleOperator =
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
  | 'starts_with'
  | 'ends_with'
  | 'exists'
  | 'not_exists';

/**
 * A single leaf condition, e.g. { field: "vehicle.mileage", operator: "gte", value: 150000 }.
 * `field` supports dotted paths so conditions can reach into nested
 * context objects (vehicle.*, fuelLog.*, expense.*, etc.) without the
 * engine needing to know the shape of any particular domain.
 */
export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value?: unknown;
}

/**
 * A boolean group of conditions/sub-groups, evaluated left-to-right.
 * Nesting groups inside `conditions` is what gives administrators
 * arbitrary AND/OR trees, e.g.:
 *   (vehicle_type = "Truck" AND mileage > 150000) OR (fuel_type = "Diesel" AND odometer > 200000)
 */
export interface RuleConditionGroup {
  type: 'AND' | 'OR';
  conditions: Array<RuleCondition | RuleConditionGroup>;
}

export function isConditionGroup(
  node: RuleCondition | RuleConditionGroup
): node is RuleConditionGroup {
  return (
    (node as RuleConditionGroup).type !== undefined &&
    Array.isArray((node as RuleConditionGroup).conditions)
  );
}

/**
 * Action `type` is intentionally a loose string (with a few well-known
 * built-ins) rather than a closed enum, since other modules are expected
 * to register their own executors against RuleActionRegistry at runtime
 * without needing to modify this shared type file.
 */
export type RuleActionType =
  | 'publish_event'
  | 'notify'
  | 'audit_log'
  | 'start_workflow'
  | 'set_variable'
  | (string & {});

export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
}

export type RuleStatus = 'active' | 'inactive' | 'draft';

export interface Rule extends BaseEntity {
  name: string;
  description?: string;
  /** Free-form grouping for the rule list UI, e.g. "maintenance", "fuel", "expense". */
  category: string;
  /** Event name this rule listens for, e.g. "vehicle.updated", "fuel.logged". */
  trigger: string;
  conditions: RuleConditionGroup;
  actions: RuleAction[];
  /** Lower number = evaluated first within the same trigger. */
  priority: number;
  status: RuleStatus;
  /** Bumped automatically on every update so execution logs can record which
   *  definition produced a given outcome, even after the rule changes later. */
  version: number;
  /** Named values merged into the evaluation context before conditions run,
   *  letting a rule reference reusable constants (e.g. thresholds) by name. */
  variables?: Record<string, unknown>;
  /** If true and this rule matches, lower-priority rules for the same
   *  trigger are skipped for this evaluation pass. */
  stopOnMatch?: boolean;
  tags?: string[];
}

export interface RuleEvaluationContext {
  [key: string]: unknown;
}

export interface RuleConditionTrace {
  node: RuleCondition | RuleConditionGroup;
  result: boolean;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  trace: RuleConditionTrace[];
  evaluatedAt: Date;
}

export interface RuleExecutionResult extends RuleEvaluationResult {
  actionsExecuted: Array<{ type: RuleActionType; success: boolean; error?: string }>;
}

export interface RuleFilters {
  category?: string;
  trigger?: string;
  status?: RuleStatus;
  tag?: string;
}

export interface RuleTestRequest {
  context: RuleEvaluationContext;
}

export interface RuleTestResponse extends RuleEvaluationResult {
  wouldExecuteActions: RuleAction[];
}