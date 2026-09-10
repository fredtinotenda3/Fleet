// tests/security/write-payload-schema-conformance.spec.ts
//
// "Every field a write handler feeds must survive its schema."
//
// ---------------------------------------------------------------------
// THE CLASS OF BUG THIS PINS
// ---------------------------------------------------------------------
// A zod `z.object` STRIPS keys it does not declare. So a handler can
// carefully assemble a value, hand it to validation, and get back an
// object with that value quietly deleted. Nothing throws. The write
// succeeds. The field is simply not there.
//
// This has now shipped three times in this codebase:
//
//   1. drivers.orgUnitId  -- computed in the controller, stripped by
//      driverCreateSchema, then also missing from an allowlist payload.
//      Symptom: "POST 201, GET returns nothing."
//   2. drivers.orgUnitId again on the update path.
//   3. fuel.driver_id     -- sent by the form, resolved from a name by
//      the spreadsheet importer, copied into the payload by the
//      handler, listed in UPDATABLE_FIELDS by an earlier fix, and
//      absent from fuelLogBaseSchema. Symptom: every fuel log reads
//      "Unassigned" in Fuel Cost by Driver.
//
// Each time it was found by a human noticing a wrong screen, months
// later. Each time a cast (`as Record<string, unknown>`, `as any`) is
// what let the dead read compile.
//
// ---------------------------------------------------------------------
// WHAT THIS ASSERTS, AND WHY IT IS BUILT THIS WAY
// ---------------------------------------------------------------------
// For every command handler that validates an assembled payload:
//
//     keys the handler feeds  ⊆  fields the schema declares
//
// The left side is read from the SOURCE (the payload literal, plus any
// allowlist array the handler copies from), because that is the list a
// developer edits. The right side is read from the SCHEMA AT RUNTIME by
// importing it, because a regex over a schema file cannot see `.extend`,
// `.merge` or a shared base.
//
// Discovery is automatic and LOUD: a handler whose payload or schema
// cannot be located fails the suite rather than being skipped. A
// discovery-based test that quietly finds nothing is worse than no test,
// because it reports success.

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const ROOT = path.join(__dirname, '..', '..');

/**
 * The handlers that assemble a payload and validate it.
 *
 * Listed explicitly rather than globbed because the property only holds
 * for handlers that build a payload LITERAL. Controllers that validate a
 * raw request `body` have no local list of keys to compare against --
 * for those the schema IS the contract, which is correct and needs no
 * check.
 */
const HANDLERS = [
  'modules/fuel/commands/handlers/create-fuel-log.handler.ts',
  'modules/fuel/commands/handlers/update-fuel-log.handler.ts',
  'modules/expenses/commands/handlers/create-expense.handler.ts',
  'modules/expenses/commands/handlers/update-expense.handler.ts',
  'modules/trips/commands/handlers/create-trip.handler.ts',
  'modules/trips/commands/handlers/update-trip.handler.ts',
  'modules/vehicles/commands/handlers/create-vehicle.handler.ts',
  'modules/vehicles/commands/handlers/update-vehicle.handler.ts',
  'modules/maintenance/commands/handlers/create-reminder.handler.ts',
  'modules/maintenance/commands/handlers/update-reminder.handler.ts',
];

/** Strips // and /* *\/ comments so a code check never reads prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The body of the brace-balanced object literal starting at `open`. */
function balancedBody(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced object literal');
}

/** Top-level `key:` names of an object-literal body. */
function literalKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let lineStart = 0;
  for (let i = 0; i <= body.length; i += 1) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    if (ch === '\n' || i === body.length) {
      const line = body.slice(lineStart, i);
      // Depth is measured at the START of the line, so a nested
      // object's inner keys are not counted as top level.
      const startDepth = depth - netDepth(line);
      if (startDepth === 0) {
        const m = line.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/);
        if (m) keys.push(m[1]);
      }
      lineStart = i + 1;
    }
  }
  return keys;
}

function netDepth(line: string): number {
  let d = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '[' || ch === '(') d += 1;
    else if (ch === '}' || ch === ']' || ch === ')') d -= 1;
  }
  return d;
}

/** Entries of a `const NAME = [ 'a', 'b' ] as const` allowlist. */
function allowlistFields(source: string): string[] {
  const out: string[] = [];
  const re = /const\s+[A-Z_]*(?:UPDATABLE|ALLOWED)[A-Z_]*\s*=\s*\[([\s\S]*?)\]\s*as const/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    for (const q of m[1].matchAll(/'([^']+)'/g)) out.push(q[1]);
  }
  return out;
}

interface ZodInternals {
  def?: { innerType?: unknown };
  shape?: Record<string, unknown>;
}

function shapeKeys(schema: unknown, depth = 0): string[] | null {
  if (depth > 6) return null;
  const inner = (schema ?? {}) as ZodInternals;
  if (inner.shape && typeof inner.shape === 'object') return Object.keys(inner.shape);
  if (inner.def?.innerType) return shapeKeys(inner.def.innerType, depth + 1);
  return null;
}

interface Case {
  handler: string;
  schemaExport: string;
  payloadKeys: string[];
  schemaFields: string[];
}

function buildCase(relPath: string): Case {
  const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const source = stripComments(raw);

  const call = source.match(/validateWithZod\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,/);
  if (!call) throw new Error(`${relPath}: no validateWithZod(<schema>, ...) call found`);
  const schemaExport = call[1];

  const importLine = source.match(
    new RegExp(`import\\s*\\{[^}]*\\b${schemaExport}\\b[^}]*\\}\\s*from\\s*'([^']+)'`)
  );
  if (!importLine) throw new Error(`${relPath}: could not find the import of ${schemaExport}`);
  const modulePath = importLine[1].replace(/^@\//, '');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(ROOT, modulePath)) as Record<string, unknown>;
  const schema = mod[schemaExport];
  if (!(schema instanceof z.ZodType)) {
    throw new Error(`${relPath}: ${schemaExport} is not a zod schema`);
  }
  const schemaFields = shapeKeys(schema);
  if (!schemaFields) throw new Error(`${relPath}: ${schemaExport} has no object shape`);

  const decl = source.match(/const\s+clean(?:\s*:[^=]+)?\s*=\s*\{/);
  if (!decl) throw new Error(`${relPath}: no 'const clean = {' payload literal found`);
  const open = source.indexOf('{', decl.index);

  const payloadKeys = Array.from(
    new Set([...literalKeys(balancedBody(source, open)), ...allowlistFields(source)])
  );
  if (payloadKeys.length === 0) throw new Error(`${relPath}: payload literal has no keys`);

  return { handler: relPath, schemaExport, payloadKeys, schemaFields };
}

const cases = HANDLERS.map(buildCase);

describe('a write handler never feeds a field its schema would strip', () => {
  it('discovered every handler (a vacuous pass is the failure mode here)', () => {
    expect(cases).toHaveLength(HANDLERS.length);
  });

  it.each(cases.map((c) => [c.handler, c] as const))('%s', (_label, entry) => {
    const stripped = entry.payloadKeys.filter((k) => !entry.schemaFields.includes(k));

    // The failure names the handler, the schema and the exact fields
    // that would vanish -- "driver_id is silently deleted by
    // fuelLogCreateSchema" is actionable; "expected [] to equal [x]" is
    // not.
    expect({
      handler: entry.handler,
      schema: entry.schemaExport,
      silentlyStripped: stripped,
    }).toEqual({
      handler: entry.handler,
      schema: entry.schemaExport,
      silentlyStripped: [],
    });
  });
});
