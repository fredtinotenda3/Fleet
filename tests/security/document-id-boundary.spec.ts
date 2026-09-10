// tests/security/document-id-boundary.spec.ts
//
// "`_id` is declared `string` and the driver returns an `ObjectId`."
//
// ---------------------------------------------------------------------
// WHY A BLANKET RETYPE WAS THE WRONG FIX
// ---------------------------------------------------------------------
// The obvious repair -- change the declared type to `ObjectId` -- would
// silently break roughly twenty `updateOne({_id: doc._id})` sites in
// scripts/, which read documents with the RAW driver and correctly pass
// an ObjectId. The lie is not in the type; it is at the boundary where a
// repository casts a driver document to a domain type without converting
// anything (`as unknown as Promise<T[]>`), and every consumer downstream
// then treats `_id` as a string. It behaves like one right up until it is
// compared, or used in a query filter -- where a bare string matches
// nothing and the write silently does nothing at all.
//
// So the fix is the boundary, and this file asserts the boundary holds:
//
//   1. ONE implementation of the rule, shared by the repositories that
//      extend BaseRepository AND the three that do not.
//   2. No entity-returning repository read casts without normalising.
//   3. Aggregations are exempt, because an aggregate's `_id` is a GROUP
//      KEY and converting it would corrupt the result.

import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import {
  normalizeDocumentId,
  normalizeDocumentIds,
  toObjectId,
} from '../../server/repositories/document-id.utils';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.repository.ts')) out.push(full);
  }
  return out;
}

const REPOSITORIES = [
  ...walk(path.join(ROOT, 'modules')),
  ...walk(path.join(ROOT, 'server')),
];

describe('the normalisation itself', () => {
  it('converts a top-level ObjectId _id to its hex string', () => {
    const id = new ObjectId();
    const out = normalizeDocumentId<{ _id: string; name: string }>({ _id: id, name: 'AFU0078' });
    expect(out._id).toBe(id.toHexString());
    expect(typeof out._id).toBe('string');
    expect(out.name).toBe('AFU0078');
  });

  it('leaves a document that is already normalised alone', () => {
    const doc = { _id: 'abc', name: 'x' };
    expect(normalizeDocumentId(doc)).toBe(doc);
  });

  it('does NOT walk nested objects or arrays', () => {
    // Deliberate: reference fields are stored as strings in this schema,
    // a deep walk costs a traversal on every read, and it would rewrite
    // ObjectIds inside caller payloads that legitimately hold them.
    const nested = new ObjectId();
    const out = normalizeDocumentId<Record<string, unknown>>({
      _id: new ObjectId(),
      meta: { ref: nested },
      list: [nested],
    });
    expect((out.meta as { ref: unknown }).ref).toBe(nested);
    expect((out.list as unknown[])[0]).toBe(nested);
  });

  it('survives null, undefined and primitives', () => {
    expect(normalizeDocumentId(null)).toBeNull();
    expect(normalizeDocumentId(undefined)).toBeUndefined();
    expect(normalizeDocumentId(42)).toBe(42);
    expect(normalizeDocumentIds([])).toEqual([]);
  });

  it('round-trips back to an ObjectId for a raw query filter', () => {
    // The other half of the boundary. A normalised document fed into a
    // raw `updateOne({_id})` matches nothing without this.
    const id = new ObjectId();
    const normalised = normalizeDocumentId<{ _id: string }>({ _id: id });
    expect(toObjectId(normalised._id).equals(id)).toBe(true);
    expect(toObjectId(id)).toBe(id);
  });
});

describe('one implementation, shared', () => {
  it('BaseRepository delegates rather than keeping its own copy', () => {
    // Three repositories do not extend BaseRepository and need the same
    // rule; duplicating it into them is how two implementations of one
    // rule begin.
    const base = fs.readFileSync(
      path.join(ROOT, 'server/repositories/base.repository.ts'),
      'utf8'
    );
    expect(base).toMatch(/normalizeDocumentId<R>\(doc\)/);
    expect(base).toMatch(/normalizeDocumentIds<R>\(docs\)/);
    // and no longer carries its own inline implementation
    expect(base).not.toMatch(/id instanceof ObjectId\s*\)\s*\{\s*\n\s*return \{ \.\.\.raw/);
  });

  it('the standalone repositories use the shared function', () => {
    for (const rel of [
      'modules/attention/repositories/attention-dispatch.repository.ts',
      'modules/telematics/repositories/eagletrack-tracker-link.repository.ts',
      'modules/telematics/repositories/eagletrack-trigger.repository.ts',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect({ file: rel, normalises: src.includes('normalizeDocumentIds') }).toEqual({
        file: rel,
        normalises: true,
      });
    }
  });
});

describe('no entity read casts without normalising', () => {
  it('found the repositories', () => {
    expect(REPOSITORIES.length).toBeGreaterThan(40);
  });

  it('no `find(...).toArray() as Promise<T[]>` remains', () => {
    /*
      The cast that converts nothing. An aggregation is exempt -- its
      `_id` is a group key, not a document id -- so the check looks at
      what precedes the call.
    */
    const offenders: string[] = [];

    for (const file of REPOSITORIES) {
      const src = fs.readFileSync(file, 'utf8');
      const pattern = /\.toArray\(\)\s+as\s+(?:unknown\s+as\s+)?Promise<\s*[A-Za-z0-9_]+\s*\[\]\s*>/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(src))) {
        const window = src.slice(Math.max(0, match.index - 400), match.index);
        const lastAggregate = window.lastIndexOf('.aggregate(');
        const lastFind = window.lastIndexOf('.find(');
        if (lastAggregate > lastFind) continue; // an aggregation: exempt
        const line = src.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }

    expect({ unnormalisedEntityReads: offenders }).toEqual({ unnormalisedEntityReads: [] });
  });
});

describe('the scripts are deliberately untouched', () => {
  it('scripts/ still query with a raw ObjectId', () => {
    // They read with the RAW driver, so their documents carry an
    // ObjectId `_id` and `updateOne({_id: doc._id})` is CORRECT there.
    // Retyping `_id` globally would have broken roughly twenty of these
    // silently -- a string matches no document and the write no-ops.
    // This asserts the exemption is real, so nobody "fixes" it.
    const scripts = fs
      .readdirSync(path.join(ROOT, 'scripts'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));

    const rawIdWrites = scripts.filter((src) => /updateOne\(\{ ?_id:/.test(src));
    expect(rawIdWrites.length).toBeGreaterThan(0);
  });
});
