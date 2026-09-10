// shared/validations/update-schema.utils.ts
//
// `partialForUpdate(base)` -- the schema an UPDATE endpoint should use.
//
// ---------------------------------------------------------------------
// THE DEFECT THIS EXISTS TO REMOVE
// ---------------------------------------------------------------------
// Every update schema in this codebase was written as
// `someBaseSchema.partial()`. That reads as "all fields optional", and
// it is -- but `.partial()` does NOT remove `.default()`. An absent key
// still gets its default value materialised into the parse output, and
// every update handler spreads that output wholesale into the write.
//
// So a PATCH that changes one field silently rewrites others. Measured
// against the shipped schemas, sending only `{_id}`:
//
//   vehicleUpdateSchema  -> injects status, color
//   driverUpdateSchema   -> injects status
//   fuelLogUpdateSchema  -> injects payment_method
//   fuelCardUpdateSchema -> injects status, currency
//   reminderUpdateSchema -> injects priority
//   ruleUpdateSchema     -> injects status, priority, version, stopOnMatch
//   workflowUpdateSchema -> injects status, version, triggers, config
//
// Read those as operations rather than as field names:
//
//   - A vehicle marked `sold` or `maintenance` returns to `active` --
//     back into the fleet count, the utilisation denominator and the
//     maintenance schedule.
//   - A SUSPENDED DRIVER BECOMES ACTIVE, so they reappear in dispatch
//     and assignment pickers. A suspension is usually a licence or a
//     disciplinary matter; silently lifting it is the most serious
//     instance here.
//   - A blocked fuel card becomes active, and its currency resets --
//     which changes what its transactions are worth.
//   - A workflow's `triggers` and `config` are replaced by empty
//     defaults, which does not disable the workflow: it leaves it
//     enabled and doing nothing.
//
// None of this errors, and the UI hides it: the edit forms send every
// field, so the injected default usually equals the value already
// stored. It bites on any partial write -- an inline status toggle, an
// integration, a script, a future "quick edit" -- and the record it
// corrupts looks perfectly ordinary afterwards.
//
// ---------------------------------------------------------------------
// WHY A HELPER RATHER THAN EDITING SEVEN SCHEMAS
// ---------------------------------------------------------------------
// Hand-editing each base to move its defaults into a separate create
// schema would work once and decay immediately: the next `.default()`
// anyone adds to a base schema reintroduces the bug in a file that looks
// exactly like its neighbours. `partialForUpdate` makes the safe form
// the short form, and
// tests/security/update-schema-defaults.spec.ts asserts the property
// over EVERY exported update schema, so a new one built the old way
// fails the suite rather than shipping.
//
// Defaults are deliberately kept on the CREATE path, where "absent
// means use the default" is exactly right.

import { z } from 'zod';

/**
 * Recursively removes `.default()` / `.prefault()` from a schema while
 * preserving the optional/nullable wrappers around it.
 *
 * The recursion is not decoration: `z.number().default(1).optional()`
 * produces ZodOptional(ZodDefault(ZodNumber)), so unwrapping only the
 * outermost layer leaves the default in place and the field still
 * injects. That exact shape exists in the shipped schemas.
 */
function stripDefaults(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = (schema as unknown as { def?: { type?: string; innerType?: z.ZodTypeAny } }).def;
  const type = def?.type;
  const inner = def?.innerType;

  if ((type === 'default' || type === 'prefault') && inner) {
    return stripDefaults(inner);
  }
  if (type === 'optional' && inner) {
    return z.optional(stripDefaults(inner));
  }
  if (type === 'nullable' && inner) {
    return z.nullable(stripDefaults(inner));
  }
  return schema;
}

/**
 * The update-side view of a create/base object schema: every field
 * optional, and no field able to materialise a value the caller did not
 * send.
 *
 * Nested defaults inside an object-valued field are left alone on
 * purpose. If the caller sends that object they are replacing it whole,
 * and filling in its own sub-defaults is then correct; the bug is only
 * ever about keys the caller did not mention at all.
 *
 * The return type is exactly what `base.partial()` would have produced,
 * so every existing `z.infer<>` and DTO stays byte-identical. Removing a
 * `.default()` cannot change a field's OUTPUT type: `ZodDefault<ZodString>`
 * and `ZodString` both output `string`, and `.partial()` adds the
 * `| undefined` either way. Only the runtime injection differs, which is
 * the entire point.
 */
export function partialForUpdate<T extends z.ZodRawShape>(
  base: z.ZodObject<T>
): ReturnType<z.ZodObject<T>['partial']> {
  const shape = { ...base.shape } as unknown as Record<string, z.ZodTypeAny>;
  const stripped: Record<string, z.ZodTypeAny> = {};
  for (const key of Object.keys(shape)) {
    stripped[key] = stripDefaults(shape[key]);
  }
  return z.object(stripped).partial() as unknown as ReturnType<z.ZodObject<T>['partial']>;
}
