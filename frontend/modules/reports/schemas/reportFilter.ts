// frontend/modules/reports/schemas/reportFilter.ts
//
// Filter conditions sent to report-query.engine.ts as part of a
// ReportDefinition. Operators are restricted to the set the query engine
// supports so the builder can never construct a filter the backend would
// reject.

import { z } from 'zod';

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'isNull',
  'isNotNull',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const OPERATORS_REQUIRING_NO_VALUE: FilterOperator[] = ['isNull', 'isNotNull'];
const OPERATORS_REQUIRING_ARRAY_VALUE: FilterOperator[] = ['in', 'notIn', 'between'];

export const reportFilterConditionSchema = z
  .object({
    id: z.string().min(1),
    field: z.string().min(1),
    dataSource: z.string().min(1),
    operator: z.enum(FILTER_OPERATORS),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
  })
  .refine(
    (f) => OPERATORS_REQUIRING_NO_VALUE.includes(f.operator) || f.value !== undefined,
    { message: 'This condition requires a value.', path: ['value'] },
  )
  .refine(
    (f) =>
      !OPERATORS_REQUIRING_ARRAY_VALUE.includes(f.operator) ||
      (Array.isArray(f.value) && f.value.length > 0),
    { message: 'This condition requires one or more values.', path: ['value'] },
  )
  .refine(
    (f) => f.operator !== 'between' || (Array.isArray(f.value) && f.value.length === 2),
    { message: '"Between" requires exactly two values.', path: ['value'] },
  );

export type ReportFilterCondition = z.infer<typeof reportFilterConditionSchema>;

export const FILTER_LOGIC = ['and', 'or'] as const;
export type FilterLogic = (typeof FILTER_LOGIC)[number];

export const reportFilterGroupSchema = z.object({
  logic: z.enum(FILTER_LOGIC).default('and'),
  conditions: z.array(reportFilterConditionSchema).default([]),
});

export type ReportFilterGroup = z.infer<typeof reportFilterGroupSchema>;

export const defaultFilterGroup: ReportFilterGroup = { logic: 'and', conditions: [] };