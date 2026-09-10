// tests/security/update-schema-defaults.spec.ts
//
// "A PATCH must not change a field the caller did not send."
//
// ---------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------
// Every update schema was `someBase.partial()`. `.partial()` makes
// fields optional but leaves `.default()` in place, and an absent key
// still materialises its default into the parse output -- which every
// update handler then spreads wholesale into the write.
//
// Measured on the shipped schemas, a PATCH carrying only `{_id}`
// rewrote: vehicle status and colour, DRIVER STATUS, fuel-log payment
// method, fuel-card status and currency, reminder priority, and a
// workflow's triggers, config, status and version.
//
// The consequences are operations, not field names. A vehicle marked
// `sold` returns to `active` and rejoins the fleet count and the
// maintenance schedule. A SUSPENDED DRIVER BECOMES ACTIVE and reappears
// in dispatch. A blocked fuel card unblocks. A workflow keeps running
// with its triggers replaced by empty defaults.
//
// It never errored and the UI hid it, because the edit forms send every
// field so the injected default usually equalled the stored value. It
// bites on any partial write -- an inline toggle, an integration, a
// script -- and the corrupted record looks entirely ordinary afterwards.
//
// ---------------------------------------------------------------------
// WHY THIS TEST IS STRUCTURAL
// ---------------------------------------------------------------------
// Asserting the seven known cases would pass forever while the eighth
// ships. The rule is a property of the SHAPE -- "no field of an update
// schema may carry a default" -- so this file discovers every
// `*UpdateSchema` exported from shared/validations and checks all of
// them. A new update schema written the old way fails here rather than
// in production.

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const VALIDATIONS_DIR = path.join(__dirname, '..', '..', 'shared', 'validations');

interface ZodInternals {
  def?: { type?: string; innerType?: unknown };
  shape?: Record<string, unknown>;
}

function internals(schema: unknown): ZodInternals {
  return (schema ?? {}) as ZodInternals;
}

/**
 * Walks the optional/nullable wrapper chain looking for a default.
 *
 * Recursive because `z.number().default(1).optional()` puts the default
 * INSIDE the optional -- a shape that exists in these schemas and that a
 * single-level check misses entirely.
 */
function carriesDefault(schema: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  const def = internals(schema).def;
  if (!def) return false;
  if (def.type === 'default' || def.type === 'prefault') return true;
  if (def.type === 'optional' || def.type === 'nullable' || def.type === 'nonoptional') {
    return carriesDefault(def.innerType, depth + 1);
  }
  return false;
}

/** The object shape of a schema, seeing through refinement wrappers. */
function shapeOf(schema: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6) return null;
  const inner = internals(schema);
  if (inner.shape && typeof inner.shape === 'object') return inner.shape;
  if (inner.def?.innerType) return shapeOf(inner.def.innerType, depth + 1);
  return null;
}

const schemaFiles = fs
  .readdirSync(VALIDATIONS_DIR)
  .filter((f) => f.endsWith('.schema.ts'))
  .sort();

interface Discovered {
  file: string;
  exportName: string;
  schema: unknown;
}

const discovered: Discovered[] = [];
for (const file of schemaFiles) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(VALIDATIONS_DIR, file)) as Record<string, unknown>;
  for (const [exportName, value] of Object.entries(mod)) {
    if (!/Update(Schema)?$/.test(exportName)) continue;
    if (!(value instanceof z.ZodType)) continue;
    discovered.push({ file, exportName, schema: value });
  }
}

describe('update schemas never materialise a value the caller did not send', () => {
  it('found update schemas to check (guards against the discovery silently finding none)', () => {
    // A discovery-based test that discovers nothing passes vacuously.
    // The floor is deliberately well below the current count so ordinary
    // additions do not churn it.
    expect(discovered.length).toBeGreaterThanOrEqual(20);
  });

  it.each(discovered.map((d) => [`${d.file} :: ${d.exportName}`, d] as const))(
    '%s carries no field-level default',
    (_label, entry) => {
      const shape = shapeOf(entry.schema);
      if (!shape) {
        // Not an object schema (a z.union, say). Nothing to assert, and
        // failing here would punish a legitimate shape.
        return;
      }

      const offenders = Object.keys(shape).filter((key) => carriesDefault(shape[key]));

      // Named in the failure so the message says which FIELD would be
      // silently rewritten, not merely that something is wrong.
      expect({ schema: entry.exportName, fieldsWithDefaults: offenders }).toEqual({
        schema: entry.exportName,
        fieldsWithDefaults: [],
      });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────
// The behavioural half: the seven that actually shipped broken.
// ─────────────────────────────────────────────────────────────────────

import { fuelLogUpdateSchema, fuelLogCreateSchema } from '../../shared/validations/fuel.schema';
import { vehicleUpdateSchema } from '../../shared/validations/vehicle.schema';
import { driverUpdateSchema } from '../../shared/validations/driver.schema';
import { reminderUpdateSchema } from '../../shared/validations/maintenance.schema';
import { fuelCardUpdateSchema } from '../../shared/validations/fuel-card.schema';
import { ruleUpdateSchema } from '../../shared/validations/rule.schema';
import { workflowUpdateSchema } from '../../shared/validations/workflow.schema';

describe('a minimal PATCH parses to exactly what was sent', () => {
  const cases: Array<[string, z.ZodType, Record<string, unknown>]> = [
    ['fuel log', fuelLogUpdateSchema, { _id: 'log-1' }],
    ['vehicle', vehicleUpdateSchema, { _id: 'veh-1' }],
    ['driver', driverUpdateSchema, { _id: 'drv-1' }],
    ['reminder', reminderUpdateSchema, { _id: 'rem-1' }],
    ['fuel card', fuelCardUpdateSchema, { _id: 'card-1' }],
    ['rule', ruleUpdateSchema, {}],
    ['workflow', workflowUpdateSchema, {}],
  ];

  it.each(cases)('%s', (_label, schema, input) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(true);
    const parsed = (result as { data: Record<string, unknown> }).data;
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(input).sort());
  });

  it('a suspended driver is not reactivated by an unrelated edit', () => {
    // The sharpest instance. Before the fix this parse produced
    // `status: 'active'`, and the update handler wrote it.
    const parsed = driverUpdateSchema.parse({ _id: 'drv-1', phone: '+263 77 000 0000' });
    expect(parsed).not.toHaveProperty('status');
  });

  it('a sold vehicle is not returned to the active fleet by an odometer edit', () => {
    const parsed = vehicleUpdateSchema.parse({ _id: 'veh-1', odometer: 84000 });
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('CREATE schemas keep their defaults', () => {
  it('a new fuel log still defaults to cash', () => {
    // The fix must not spill onto the create path, where "absent means
    // use the default" is exactly the right behaviour.
    const parsed = fuelLogCreateSchema.parse({
      license_plate: 'AFU0078',
      date: '2026-09-01',
      fuel_volume: 50,
      unit_id: 'L',
      cost: 100,
    });
    expect(parsed.payment_method).toBe('cash');
  });
});
